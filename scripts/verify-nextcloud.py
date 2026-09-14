"""Opt-in live CalDAV acceptance against a disposable Nextcloud account.

Environment: NC_TEST_URL, NC_TEST_USER, NC_TEST_PASSWORD_FILE, DATABASE_URL (disposable),
DATA_DIR (disposable), SECRET_KEY, INTEGRATION_LAN_HOSTS and optional SSL_CERT_FILE.
Creates and deletes one dedicated calendar. Never use a production database.
"""

import os
import sys
import uuid
from pathlib import Path
from datetime import date, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from fastapi.testclient import TestClient
from main import app
from auth import create_access_token, hash_password
from database import SessionLocal
from models import User, CalendarEvent, CalendarJob, Integration, PlannerSlot
from integrations import DAV, process_sync, decrypt


def main():
    with SessionLocal() as db:
        user = User(
            username="live-" + str(uuid.uuid4()),
            email=str(uuid.uuid4()) + "@example.test",
            password_hash=hash_password(str(uuid.uuid4())),
            is_admin=True,
        )
        db.add(user)
        db.commit()
        token = create_access_token({"sub": user.id})
    client = TestClient(app, headers={"Authorization": "Bearer " + token})

    def call(method, path, body=None):
        result = client.request(method, path, json=body)
        assert result.status_code < 300, (method, path, result.status_code, result.text)
        return result.json()

    config = {
        "url": os.environ["NC_TEST_URL"],
        "username": os.environ["NC_TEST_USER"],
        "secret": Path(os.environ["NC_TEST_PASSWORD_FILE"]).read_text().strip(),
        "enabled": False,
    }
    call("PUT", "/api/integrations/nextcloud", config)
    discovered = call("POST", "/api/integrations/nextcloud/discover")
    print("Writable calendar discovery passed:", len(discovered["calendars"]))
    call("POST", "/api/integrations/nextcloud/calendar", {"create": True})
    with SessionLocal() as db:
        integration = db.get(Integration, "nextcloud")
        dav = DAV(integration.config, decrypt(integration.secret))
        calendar = integration.config["calendar_url"]
    try:
        meal = call(
            "POST",
            "/api/meals",
            {
                "name": "Live CalDAV test soup",
                "steps": ["Cook."],
                "ingredients": [{"name": "Carrot", "quantity": 1}],
            },
        )
        today = date.today()
        monday = today - timedelta(days=today.weekday())

        def edit(slots=None, remove=None):
            plan = call("GET", "/api/planner?week=" + str(monday))
            review = call(
                "POST",
                "/api/planner/preview",
                {
                    "expected_version": plan["version"],
                    "slots": slots or [],
                    "remove_ids": remove or [],
                },
            )
            call(
                "POST",
                "/api/planner/commit",
                {"token": review["token"], "request_id": str(uuid.uuid4())},
            )

        slot = {
            "id": "live-" + str(uuid.uuid4()),
            "day": str(monday),
            "meal_id": meal["id"],
            "servings": 2,
        }
        edit([slot])
        process_sync()
        with SessionLocal() as db:
            remote = db.get(CalendarEvent, slot["id"])
            assert remote is not None
            href, uid = remote.href, remote.uid
            assert db.query(CalendarJob).count() == 0
        response = dav.request("GET", href)
        assert response.status_code == 200
        assert b"TRANSP:TRANSPARENT" in response.content
        print("Create, ownership UID, free timed event and persisted outbox passed")
        slot["day"] = str(monday + timedelta(days=1))
        slot["servings"] = 4
        edit([slot])
        process_sync()
        with SessionLocal() as db:
            assert db.get(CalendarEvent, slot["id"]).uid == uid
        response = dav.request("GET", href)
        assert b"4 servings" in response.content
        print("Move and update without duplicate UID passed")
        # Remote edit is overwritten during durable reconciliation.
        altered = response.content.replace(
            b"Live CalDAV test soup", b"Remotely changed soup"
        )
        put = dav.request(
            "PUT",
            href,
            content=altered,
            headers={
                "If-Match": response.headers["etag"],
                "Content-Type": "text/calendar",
            },
        )
        assert put.status_code < 300
        call("POST", "/api/integrations/nextcloud/retry")
        process_sync()
        assert b"Live CalDAV test soup" in dav.request("GET", href).content
        # Remote deletion is repaired with the same identifier after reopening DB sessions.
        response = dav.request("GET", href)
        assert (
            dav.request(
                "DELETE", href, headers={"If-Match": response.headers["etag"]}
            ).status_code
            < 300
        )
        call("POST", "/api/integrations/nextcloud/retry")
        process_sync()
        assert dav.request("GET", href).status_code == 200
        print("Remote edits/deletions repaired from persisted jobs passed")
        edit(remove=[slot["id"]])
        process_sync()
        assert dav.request("GET", href).status_code == 404
        print("Planner removal propagated passed")
        # Actual authentication failure pauses the durable queue.
        edit([slot])
        call(
            "PUT",
            "/api/integrations/nextcloud",
            {**config, "secret": "invalid-disposable-password", "enabled": True},
        )
        process_sync()
        assert call("GET", "/api/integrations")["nextcloud"]["paused"]
        call("PUT", "/api/integrations/nextcloud", {**config, "enabled": True})
        process_sync()
        assert not call("GET", "/api/integrations")["nextcloud"]["paused"]
        assert dav.request("GET", href).status_code == 200
        call("PUT", "/api/integrations/nextcloud", {**config, "enabled": False})
        edit(remove=[slot["id"]])
        process_sync()
        assert dav.request("GET", href).status_code == 200
        print("Authentication pause/recovery and disable-leaves-events passed")
    finally:
        call("POST", "/api/integrations/nextcloud/disconnect")
        response = dav.request("DELETE", calendar)
        assert response.status_code in (204, 404)
        dav.close()
        print("Disposable test calendar removed")


if __name__ == "__main__":
    main()
