"""Encrypted provider settings and an installation-owned, durable CalDAV outbox."""

import asyncio
import os
import ipaddress
import socket
import uuid
from pathlib import Path
from datetime import datetime, date, timedelta, timezone
from urllib.parse import urlparse, urljoin, quote
from zoneinfo import ZoneInfo
from xml.sax.saxutils import escape

import httpx
from cryptography.fernet import Fernet
from defusedxml import ElementTree as ET
from icalendar import Calendar, Event
from sqlalchemy import delete
from config import settings
from database import SessionLocal
from models import (
    Integration,
    CalendarJob,
    CalendarEvent,
    PlannerSlot,
    PlannerState,
    Meal,
    utcnow,
)

D = "{DAV:}"
C = "{urn:ietf:params:xml:ns:caldav}"


def cipher():
    directory = Path(settings.DATA_DIR)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "integration.key"
    if not path.exists():
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, "wb") as stream:
                stream.write(Fernet.generate_key())
        except FileExistsError:
            pass
    return Fernet(path.read_bytes())


def encrypt(value):
    return cipher().encrypt(value.encode()).decode()


def decrypt(value):
    return cipher().decrypt(value.encode()).decode()


def origin(url):
    parsed = urlparse(url)
    return (
        parsed.scheme,
        parsed.hostname,
        parsed.port or (443 if parsed.scheme == "https" else 80),
    )


def validate_endpoint(url):
    parsed = urlparse(url)
    allowed = {
        h.strip().lower()
        for h in settings.INTEGRATION_LAN_HOSTS.split(",")
        if h.strip()
    }
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.fragment
    ):
        raise ValueError("Use an HTTPS URL without embedded credentials or fragments")
    try:
        addresses = socket.getaddrinfo(
            parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM
        )
    except socket.gaierror:
        raise ValueError("Unable to resolve integration host")
    for entry in addresses:
        address = ipaddress.ip_address(entry[4][0])
        if not address.is_global and parsed.hostname.lower() not in allowed:
            raise ValueError(
                "Internal integration host must be explicitly allowed by INTEGRATION_LAN_HOSTS"
            )


class DAV:
    def __init__(self, config, password):
        self.base = config["url"].rstrip("/") + "/"
        validate_endpoint(self.base)
        self.client = httpx.Client(
            auth=(config["username"], password), timeout=20, follow_redirects=False
        )

    def close(self):
        self.client.close()

    def request(self, method, href, **kwargs):
        url = urljoin(self.base, href)
        if origin(url) != origin(self.base):
            raise ValueError("Cross-origin calendar URL rejected")
        validate_endpoint(url)
        response = self.client.request(method, url, **kwargs)
        # Never follow redirects with credentials, including DAV response hrefs.
        if response.is_redirect:
            raise ValueError(
                "Calendar redirects are not supported; enter its canonical HTTPS URL"
            )
        return response

    def properties(self, href, depth="0"):
        body = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:current-user-principal/><c:calendar-home-set/><d:resourcetype/><d:displayname/><d:current-user-privilege-set/></d:prop></d:propfind>'
        response = self.request(
            "PROPFIND",
            href,
            content=body,
            headers={"Depth": depth, "Content-Type": "application/xml"},
        )
        response.raise_for_status()
        return ET.fromstring(response.content)

    def calendars(self):
        root = self.properties(self.base + "remote.php/dav/")
        principal = root.find(".//" + D + "current-user-principal/" + D + "href")
        if principal is None:
            raise ValueError("Nextcloud did not return a principal")
        root = self.properties(principal.text)
        home = root.find(".//" + C + "calendar-home-set/" + D + "href")
        if home is None:
            raise ValueError("Nextcloud did not return a calendar home")
        root = self.properties(home.text, "1")
        calendars = []
        for row in root.findall(D + "response"):
            if row.find(".//" + C + "calendar") is None:
                continue
            privileges = row.find(".//" + D + "current-user-privilege-set")
            writable = privileges is not None and any(
                privileges.find(".//" + D + p) is not None for p in ("write", "all")
            )
            if writable:
                href = urljoin(self.base, row.findtext(D + "href"))
                if origin(href) == origin(self.base):
                    calendars.append(
                        {
                            "url": href,
                            "name": row.findtext(".//" + D + "displayname")
                            or "Calendar",
                        }
                    )
        return home.text, calendars

    def create_calendar(self):
        home, _ = self.calendars()
        href = (
            urljoin(self.base, home).rstrip("/")
            + "/meal-plan-"
            + str(uuid.uuid4())
            + "/"
        )
        body = '<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:set><d:prop><d:displayname>Meal Plan</d:displayname><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>'
        response = self.request(
            "MKCALENDAR",
            href,
            content=body,
            headers={"Content-Type": "application/xml"},
        )
        response.raise_for_status()
        return href


def event_content(slot, db, uid, installation):
    state = db.get(PlannerState, "global")
    tz = ZoneInfo((state.settings if state else {}).get("timezone", "Europe/London"))
    cooking = (
        db.get(PlannerSlot, slot.cooking_slot_id) if slot.kind == "leftover" else slot
    )
    meal = db.get(Meal, cooking.meal_id) if cooking else None
    if not meal:
        return None
    start = datetime.fromisoformat(slot.day + "T" + slot.time).replace(tzinfo=tz)
    calendar = Calendar()
    calendar.add("prodid", "-//Kitchen Cupboard//Meal Planner//EN")
    calendar.add("version", "2.0")
    event = Event()
    event.add("uid", uid)
    event.add("dtstamp", datetime.now(timezone.utc))
    # UTC instants avoid incomplete VTIMEZONE definitions and preserve local DST offsets.
    event.add("dtstart", start.astimezone(timezone.utc))
    event.add(
        "dtend", start.astimezone(timezone.utc) + timedelta(minutes=slot.duration)
    )
    event.add(
        "summary",
        f'{slot.meal_type.title()}: {"Leftovers — " if slot.kind == "leftover" else ""}{meal.name}',
    )
    event.add(
        "description",
        f'{slot.servings} servings\n{slot.notes}\n{settings.PUBLIC_URL.rstrip("/")}/recipes/{meal.id}',
    )
    event.add("url", settings.PUBLIC_URL.rstrip("/") + "/recipes/" + meal.id)
    event.add("transp", "TRANSPARENT")
    event.add("x-kitchen-cupboard", installation)
    calendar.add_component(event)
    return calendar.to_ical()


def owns_event(content, uid, installation):
    try:
        events = Calendar.from_ical(content).walk("VEVENT")
        return (
            len(events) == 1
            and str(events[0].get("UID")) == uid
            and str(events[0].get("X-KITCHEN-CUPBOARD")) == installation
        )
    except Exception:
        return False


def enqueue_current(db):
    today = datetime.now(ZoneInfo("Europe/London")).date()
    monday = str(today - timedelta(days=today.weekday()))
    ids = {s.id for s in db.query(PlannerSlot).filter(PlannerSlot.day >= monday)} | {
        e.slot_id for e in db.query(CalendarEvent)
    }
    for slot_id in ids:
        if not db.get(CalendarJob, slot_id):
            db.add(CalendarJob(slot_id=slot_id))


def process_sync():
    with SessionLocal() as db:
        integration = db.get(Integration, "nextcloud")
        if (
            not integration
            or not integration.enabled
            or integration.paused
            or not integration.config.get("calendar_url")
        ):
            return
        if (
            not integration.last_reconcile
            or utcnow() - integration.last_reconcile >= timedelta(minutes=15)
        ):
            enqueue_current(db)
            integration.last_reconcile = utcnow()
            db.commit()
        try:
            dav = DAV(integration.config, decrypt(integration.secret))
        except Exception:
            integration.error = "Unable to initialise calendar connection; check configuration and server key"
            db.commit()
            return
        try:
            jobs = (
                db.query(CalendarJob)
                .filter(CalendarJob.due_at <= utcnow())
                .limit(50)
                .all()
            )
            for job in jobs:
                db.refresh(integration)
                if (
                    not integration.enabled
                    or integration.paused
                    or not integration.config.get("calendar_url")
                ):
                    return
                slot_id, revision = job.slot_id, job.revision
                try:
                    slot = db.get(PlannerSlot, slot_id)
                    remote = db.get(CalendarEvent, slot_id)
                    installation = integration.config["installation"]
                    uid = (
                        remote.uid
                        if remote
                        else f"{installation}-{slot_id}@kitchen-cupboard"
                    )
                    href = (
                        remote.href
                        if remote
                        else integration.config["calendar_url"].rstrip("/")
                        + "/"
                        + quote(uid, safe="")
                        + ".ics"
                    )
                    body = (
                        event_content(slot, db, uid, installation)
                        if slot and slot.kind != "skip"
                        else None
                    )
                    # Finish the read transaction before network I/O; revision guards retain concurrent edits.
                    db.commit()
                    for attempt in range(3):
                        if attempt:
                            db.expire_all()
                            slot = db.get(PlannerSlot, slot_id)
                            body = (
                                event_content(slot, db, uid, installation)
                                if slot and slot.kind != "skip"
                                else None
                            )
                            db.commit()
                        db.refresh(integration)
                        if not integration.enabled or not integration.config.get(
                            "calendar_url"
                        ):
                            return
                        response = dav.request("GET", href)
                        if response.status_code not in (200, 404):
                            response.raise_for_status()
                        exists = response.status_code == 200
                        if exists and not owns_event(
                            response.content, uid, installation
                        ):
                            raise ValueError("Calendar event ownership mismatch")
                        headers = (
                            {"If-Match": response.headers["etag"]}
                            if exists and response.headers.get("etag")
                            else {"If-None-Match": "*"}
                        )
                        if exists and not response.headers.get("etag"):
                            raise ValueError("Calendar did not provide an ETag")
                        if body is None:
                            result = (
                                dav.request("DELETE", href, headers=headers)
                                if exists
                                else response
                            )
                        else:
                            result = dav.request(
                                "PUT",
                                href,
                                content=body,
                                headers={
                                    **headers,
                                    "Content-Type": "text/calendar; charset=utf-8",
                                },
                            )
                        if result.status_code != 412:
                            break
                    if result.status_code != 404:
                        result.raise_for_status()
                    if body:
                        if remote is None:
                            remote = CalendarEvent(slot_id=slot_id, uid=uid, href=href)
                            db.add(remote)
                        remote.etag = result.headers.get("etag")
                    elif remote:
                        db.delete(remote)
                    db.execute(
                        delete(CalendarJob)
                        .where(
                            CalendarJob.slot_id == slot_id,
                            CalendarJob.revision == revision,
                        )
                        .execution_options(synchronize_session=False)
                    )
                    integration.last_success = utcnow()
                    integration.error = None
                    db.commit()
                except Exception as exc:
                    db.rollback()
                    integration = db.get(Integration, "nextcloud")
                    job = db.get(CalendarJob, slot_id)
                    status = (
                        exc.response.status_code
                        if isinstance(exc, httpx.HTTPStatusError)
                        else None
                    )
                    if status in (401, 403):
                        integration.paused = True
                        integration.error = "Calendar authentication or permissions failed. Update credentials to resume."
                    else:
                        integration.error = "Calendar sync failed. Check availability and calendar permissions; retry is scheduled."
                    if job and job.revision == revision:
                        job.attempts += 1
                        job.due_at = utcnow() + timedelta(
                            seconds=min(3600, 30 * 2 ** min(job.attempts, 7))
                        )
                    db.commit()
                    if integration.paused:
                        break
        finally:
            dav.close()


async def sync_worker(stop):
    while not stop.is_set():
        try:
            await asyncio.to_thread(process_sync)
        except asyncio.CancelledError:
            raise
        except Exception:
            # Never log provider exception strings, URLs or request headers.
            import logging

            logging.getLogger(__name__).error(
                "Calendar worker failed; retrying next cycle"
            )
        try:
            await asyncio.wait_for(stop.wait(), timeout=20)
        except asyncio.TimeoutError:
            pass
