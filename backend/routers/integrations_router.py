from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from auth import get_current_admin_jwt
from database import get_db
from models import Integration, CalendarJob, CalendarEvent, utcnow
from integrations import encrypt, decrypt, validate_endpoint, DAV, enqueue_current
import uuid

router = APIRouter(
    prefix="/api/integrations",
    tags=["Integrations"],
    dependencies=[Depends(get_current_admin_jwt)],
)


class IntegrationInput(BaseModel):
    url: str = Field(max_length=2000)
    secret: str | None = Field(None, max_length=1000)
    username: str = Field("", max_length=200)
    model: str = Field("", max_length=200)
    enabled: bool = False


@router.get("")
def integration_status(db: Session = Depends(get_db)):
    result = {}
    for key in ("vision", "nextcloud"):
        row = db.get(Integration, key)
        result[key] = {
            "configured": bool(row and row.secret),
            "enabled": bool(row and row.enabled),
            "config": row.config if row else {},
            "error": row.error if row else None,
            "paused": bool(row and row.paused),
            "last_success": row.last_success if row else None,
        }
    result["pending"] = db.query(CalendarJob).count()
    return result


@router.put("/{provider}")
def configure_integration(
    provider: str, data: IntegrationInput, db: Session = Depends(get_db)
):
    if provider not in ("vision", "nextcloud"):
        raise HTTPException(404, "Unknown integration")
    try:
        validate_endpoint(data.url)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    row = db.get(Integration, provider)
    if row is None:
        row = Integration(id=provider, config={})
        db.add(row)
    if (
        provider == "nextcloud"
        and row.config.get("calendar_url")
        and (row.config["url"] != data.url or row.config["username"] != data.username)
    ):
        raise HTTPException(
            409, "Disable and disconnect the current calendar before changing accounts"
        )
    if data.secret:
        row.secret = encrypt(data.secret)
    if not row.secret:
        raise HTTPException(422, "Credentials are required")
    if provider == "vision" and not data.model.strip():
        raise HTTPException(422, "A vision model is required")
    row.config = {
        **(row.config or {}),
        "url": data.url,
        "username": data.username,
        "model": data.model,
        "installation": (row.config or {}).get("installation", str(uuid.uuid4())),
    }
    row.enabled = data.enabled
    row.paused = False
    row.error = None
    if provider == "nextcloud":
        enqueue_current(db)
        for job in db.query(CalendarJob):
            job.due_at = utcnow()
    db.commit()
    return integration_status(db)


def calendar_client(db):
    row = db.get(Integration, "nextcloud")
    if not row or not row.secret:
        raise HTTPException(409, "Save Nextcloud credentials first")
    return row, DAV(row.config, decrypt(row.secret))


@router.post("/nextcloud/discover")
def discover_calendars(db: Session = Depends(get_db)):
    dav = None
    try:
        row, dav = calendar_client(db)
        home, calendars = dav.calendars()
        return {"calendars": calendars}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            502,
            "Calendar discovery failed. Check the canonical Nextcloud URL and app password.",
        )
    finally:
        if dav:
            dav.close()


class CalendarSelection(BaseModel):
    calendar_url: str | None = None
    create: bool = False


@router.post("/nextcloud/calendar")
def select_calendar(data: CalendarSelection, db: Session = Depends(get_db)):
    dav = None
    try:
        row, dav = calendar_client(db)
        if row.config.get("calendar_url"):
            raise HTTPException(
                409, "Disconnect the existing calendar before choosing another"
            )
        if data.create:
            selected = dav.create_calendar()
        else:
            home, calendars = dav.calendars()
            if data.calendar_url not in [c["url"] for c in calendars]:
                raise HTTPException(422, "Select a writable discovered calendar")
            selected = data.calendar_url
        row.config = {**row.config, "calendar_url": selected}
        row.enabled = True
        row.paused = False
        enqueue_current(db)
        db.commit()
        return integration_status(db)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            502, "Unable to select or create the calendar. Retry discovery."
        )
    finally:
        if dav:
            dav.close()


@router.post("/nextcloud/retry")
def retry_calendar(db: Session = Depends(get_db)):
    row = db.get(Integration, "nextcloud")
    if row and row.paused:
        raise HTTPException(409, "Correct credentials before retrying")
    enqueue_current(db)
    for job in db.query(CalendarJob):
        job.due_at = utcnow()
    db.commit()
    return integration_status(db)


@router.post("/nextcloud/disconnect")
def disconnect_calendar(db: Session = Depends(get_db)):
    row = db.get(Integration, "nextcloud")
    if row:
        row.enabled = False
        row.config = {k: v for k, v in row.config.items() if k != "calendar_url"}
        row.secret = None
        db.query(CalendarEvent).delete()
        db.query(CalendarJob).delete()
        db.commit()
    return integration_status(db)
