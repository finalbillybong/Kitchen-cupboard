import io
import json
import uuid
from pathlib import Path
from unittest.mock import patch
from datetime import datetime, timezone

import httpx
import pytest
from PIL import Image
from sqlalchemy import create_engine, text, inspect
from icalendar import Calendar

from test_library import api_client, bearer, second_user_token, create_key
from database import SessionLocal
from models import (
    Meal,
    PlannerSlot,
    PlannerState,
    CalendarJob,
    CalendarEvent,
    Integration,
    RecipeImage,
    ReviewReceipt,
    ListItem,
    GroceryContribution,
)
from units import canonical, scaled
from recipe_parser import parse_ingredient, extract_steps
from migrate import upgrade
from integrations import event_content, owns_event, encrypt, decrypt, process_sync


def recipe(client, headers, **kwargs):
    data = {
        "name": "Soup",
        "base_servings": 2,
        "steps": ["Chop carrots.", "Simmer for 20 minutes."],
        "tags": ["vegetarian"],
        "ingredients": [
            {"name": "Carrots", "quantity": 500, "unit": "g", "notes": "finely diced"},
            {"name": "Salt", "quantity": None, "notes": "to taste"},
        ],
        **kwargs,
    }
    response = client.post("/api/meals", headers=headers, json=data)
    assert response.status_code == 201, response.text
    return response.json()


def plan(client, headers):
    return client.get("/api/planner?week=2026-09-14", headers=headers).json()


def change_plan(client, headers, slots=None, remove_ids=None):
    result = client.post(
        "/api/planner/preview",
        headers=headers,
        json={
            "expected_version": plan(client, headers)["version"],
            "slots": slots or [],
            "remove_ids": remove_ids or [],
        },
    )
    assert result.status_code == 200, result.text
    commit = client.post(
        "/api/planner/commit",
        headers=headers,
        json={"token": result.json()["token"], "request_id": str(uuid.uuid4())},
    )
    assert commit.status_code == 200, commit.text
    return commit


def shopping(client, headers, list_id, **kwargs):
    response = client.post(
        "/api/planner/shopping/preview",
        headers=headers,
        json={"week": "2026-09-14", "list_id": list_id, **kwargs},
    )
    assert response.status_code == 200, response.text
    return response.json()


def commit_shopping(client, headers, preview):
    response = client.post(
        "/api/planner/shopping/commit",
        headers=headers,
        json={"token": preview["token"], "request_id": str(uuid.uuid4())},
    )
    assert response.status_code == 200, response.text
    return response


def items(client, headers, list_id):
    response = client.get(f"/api/lists/{list_id}/items", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_migrate_populated_legacy_clean_and_rerun(tmp_path):
    baseline = json.loads(
        (Path(__file__).parents[1] / "migrations/baseline.json").read_text()
    )
    engine = create_engine(f"sqlite:///{tmp_path}/legacy.db")
    with engine.begin() as db:
        for _, statement, indexes in baseline:
            db.exec_driver_sql(statement)
            for index in indexes:
                db.exec_driver_sql(index)
        db.exec_driver_sql(
            "INSERT INTO users(id,username,email,password_hash) VALUES ('user','legacy','legacy@example.com','hash')"
        )
        db.exec_driver_sql(
            "INSERT INTO ingredients(id,name,normalized_name,default_unit,version,is_archived,created_by,updated_by,created_at,updated_at) VALUES ('ingredient','Salt','salt','',1,0,'user','user',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"
        )
        db.exec_driver_sql(
            "INSERT INTO meals(id,name,description,base_servings,version,is_archived,created_by,updated_by,created_at,updated_at) VALUES ('meal','Legacy soup','',2,3,0,'user','user',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"
        )
        db.exec_driver_sql(
            "INSERT INTO meal_ingredients(id,meal_id,ingredient_id,quantity,unit,notes,scales_with_servings,sort_order) VALUES ('row','meal','ingredient',1,'pinch','taste',0,0)"
        )
        db.exec_driver_sql(
            "INSERT INTO shopping_lists(id,name,owner_id) VALUES ('list','Legacy shopping','user')"
        )
        db.exec_driver_sql(
            "INSERT INTO list_items(id,list_id,name,quantity,checked,added_by) VALUES ('item','list','Milk',2,1,'user')"
        )
    upgrade(engine)
    upgrade(engine)
    with engine.connect() as db:
        assert db.execute(text("SELECT id, version, steps, tags FROM meals")).one() == (
            "meal",
            3,
            "[]",
            "[]",
        )
        assert db.execute(
            text("SELECT id,quantity,notes FROM meal_ingredients")
        ).one() == ("row", 1, "taste")
        assert db.execute(
            text("SELECT id,checked,already_have FROM list_items")
        ).one() == ("item", 1, 0)
        assert db.execute(text("PRAGMA integrity_check")).scalar() == "ok"
    clean = create_engine(f"sqlite:///{tmp_path}/clean.db")
    upgrade(clean)
    upgrade(clean)
    assert set(inspect(clean).get_table_names()) == set(
        inspect(engine).get_table_names()
    )


def test_units_unknown_and_method_preservation():
    assert canonical(1, "kg") == (1000, "g")
    assert canonical(2, "litres") == (2000, "ml")
    assert canonical(1, "tin") == (1, "can")
    assert canonical(2, "clove") == (2, "clove")
    assert canonical(2, "g")[1] != canonical(2, "ml")[1]
    assert scaled(None, 4) is None
    assert parse_ingredient("salt to taste").quantity is None
    assert parse_ingredient("2 onions, finely diced").notes == "2 onions, finely diced"
    assert extract_steps(
        [
            {
                "@type": "HowToSection",
                "itemListElement": [{"text": "Chop."}, {"text": "Cook."}],
            }
        ]
    ) == ["Chop.", "Cook."]


def test_recipes_ratings_filters_exports_and_unknown(api_client):
    c, f = api_client
    h = bearer(f["jwt"])
    meal = recipe(c, h, recipe_category="Dinner", prep_minutes=10, cook_minutes=20)
    assert meal["ingredients"][1]["quantity"] is None
    assert (
        c.get(
            "/api/meals?q=carrots&tag=vegetarian&category=Dinner&max_minutes=30",
            headers=h,
        ).json()[0]["id"]
        == meal["id"]
    )
    assert c.get("/api/meals?max_minutes=29", headers=h).json() == []
    assert (
        c.put(
            f"/api/recipes/{meal['id']}/rating", headers=h, json={"value": 5}
        ).status_code
        == 200
    )
    assert (
        c.put(f"/api/recipes/{meal['id']}/rating", headers=h, json={"value": 2}).json()[
            "average_rating"
        ]
        == 2
    )
    assert (
        c.put(
            f"/api/recipes/{meal['id']}/rating", headers=h, json={"value": 6}
        ).status_code
        == 422
    )
    assert c.put(
        f"/api/recipes/{meal['id']}/collection", headers=h, json={"to_try": True}
    ).json()["to_try"]
    assert len(c.get("/api/meals?to_try=true", headers=h).json()) == 1
    exported = c.get(f"/api/recipes/{meal['id']}/export?servings=4", headers=h)
    assert "1000.0 g Carrots" in exported.text and "finely diced" in exported.text
    assert "None" not in exported.text and "1 Salt" not in exported.text
    assert c.get("/api/recipes/export?format=pdf", headers=h).content.startswith(
        b"%PDF"
    )
    csv = c.get("/api/recipes/export?format=csv", headers=h)
    assert (
        "Simmer for 20 minutes." in csv.text
        and csv.headers["cache-control"] == "no-store"
    )
    assert c.get("/api/recipes/export").status_code == 401


def test_planner_batch_once_pantry_private_lists_and_idempotency(api_client):
    c, f = api_client
    h = bearer(f["jwt"])
    meal = recipe(c, h)
    cook = {"id": "cook", "day": "2026-09-14", "meal_id": meal["id"], "servings": 2}
    leftover = {
        "id": "leftover",
        "day": "2026-09-15",
        "kind": "leftover",
        "cooking_slot_id": "cook",
        "servings": 4,
    }
    change_plan(c, h, [cook, leftover])
    p = shopping(c, h, f["own_list_id"])
    carrot = next(r for r in p["requirements"] if r["name"] == "Carrots")
    assert (
        carrot["quantity"] == 1500
        and len(carrot["sources"]) == 1
        and carrot["sources"][0]["servings"] == 6
    )
    commit_shopping(c, h, p)
    assert shopping(c, h, f["own_list_id"])["changes"] == []
    assert (
        next(i for i in items(c, h, f["own_list_id"]) if i["name"] == "Salt")[
            "quantity"
        ]
        is None
    )
    assert (
        c.post(
            "/api/planner/shopping/preview",
            headers=h,
            json={"week": "2026-09-14", "list_id": f["viewer_list_id"]},
        ).status_code
        == 403
    )
    _, other = second_user_token()
    assert (
        c.post(
            "/api/planner/shopping/preview",
            headers=bearer(other),
            json={"week": "2026-09-14", "list_id": f["own_list_id"]},
        ).status_code
        == 404
    )
    ingredient = meal["ingredients"][0]["ingredient_id"]
    assert (
        c.put(
            f"/api/pantry/{ingredient}",
            headers=h,
            json={"usually_have": True, "expected_version": plan(c, h)["version"]},
        ).status_code
        == 200
    )
    p = shopping(c, h, f["own_list_id"])
    assert p["excluded_staples"][0]["ingredient_id"] == ingredient
    assert any(x["action"] == "remove" for x in p["changes"])
    assert (
        shopping(c, h, f["own_list_id"], include_staples=[ingredient])["changes"] == []
    )


def test_archived_recipe_in_history_does_not_block_planning(api_client):
    c, f = api_client
    h = bearer(f["jwt"])
    archived = recipe(c, h)
    active = recipe(c, h, name="Fresh soup")
    change_plan(
        c, h, [{"id": "history", "day": "2026-09-07", "meal_id": archived["id"]}]
    )
    assert (
        c.delete(
            f"/api/meals/{archived['id']}?expected_version={archived['version']}",
            headers=h,
        ).status_code
        == 200
    )
    change_plan(c, h, [{"id": "new", "day": "2026-09-14", "meal_id": active["id"]}])
    current = plan(c, h)
    assert any(s["id"] == "history" for s in current["linked_slots"])
    _, admin_jwt = second_user_token("planner-admin", admin=True)
    assert (
        c.put(
            "/api/planner/settings",
            headers=bearer(admin_jwt),
            json={**current["settings"], "expected_version": current["version"]},
        ).status_code
        == 200
    )
    assert (
        c.post(
            "/api/planner/preview",
            headers=h,
            json={
                "expected_version": plan(c, h)["version"],
                "slots": [
                    {"id": "invalid", "day": "2026-09-15", "meal_id": archived["id"]}
                ],
            },
        ).status_code
        == 422
    )


def test_leftovers_concurrency_swaps_and_suggestion_shortfall(api_client):
    c, f = api_client
    h = bearer(f["jwt"])
    m = recipe(c, h)
    change_plan(
        c,
        h,
        [
            {"id": "cook", "day": "2026-09-14", "meal_id": m["id"], "pinned": True},
            {
                "id": "left",
                "day": "2026-09-15",
                "kind": "leftover",
                "cooking_slot_id": "cook",
            },
        ],
    )
    version = plan(c, h)["version"]
    for slots, remove in [
        ([], ["cook"]),
        (
            [
                {
                    "id": "left",
                    "day": "2026-09-13",
                    "kind": "leftover",
                    "cooking_slot_id": "cook",
                }
            ],
            [],
        ),
        (
            [
                {
                    "id": "cook",
                    "day": "2026-09-14",
                    "kind": "leftover",
                    "cooking_slot_id": "left",
                }
            ],
            [],
        ),
    ]:
        assert (
            c.post(
                "/api/planner/preview",
                headers=h,
                json={
                    "expected_version": version,
                    "slots": slots,
                    "remove_ids": remove,
                },
            ).status_code
            == 422
        )
    preview = c.post(
        "/api/planner/suggestions",
        headers=h,
        json={"week": "2026-09-14", "expected_version": version, "fish": 2},
    ).json()
    assert preview["unmet"]["fish"] == 2 and preview["unfilled"] == 5
    assert next(s for s in preview["slots"] if s["id"] == "cook")["pinned"]
    change_plan(
        c,
        h,
        [{"id": "skip", "day": "2026-09-16", "kind": "skip", "notes": "Eating out"}],
    )
    assert (
        c.post(
            "/api/planner/commit",
            headers=h,
            json={"token": preview["token"], "request_id": str(uuid.uuid4())},
        ).status_code
        == 409
    )
    key = create_key(c, f["jwt"], "read")
    assert (
        c.post(
            "/api/planner/preview",
            headers=bearer(key),
            json={"expected_version": version},
        ).status_code
        == 403
    )


def test_groceries_purchase_increases_reductions_manual_extras_and_stale(api_client):
    c, f = api_client
    h = bearer(f["jwt"])
    m = recipe(c, h, ingredients=[{"name": "Carrots", "quantity": 500, "unit": "g"}])
    list_id = f["own_list_id"]
    slot = {"id": "cook", "day": "2026-09-14", "meal_id": m["id"], "servings": 2}
    change_plan(c, h, [slot])
    commit_shopping(c, h, shopping(c, h, list_id))
    item = items(c, h, list_id)[0]
    stale = shopping(c, h, list_id)
    c.post(
        f"/api/lists/{list_id}/items",
        headers=h,
        json={"name": "Personal treat", "quantity": 2},
    )
    assert (
        c.post(
            "/api/planner/shopping/commit",
            headers=h,
            json={"token": stale["token"], "request_id": str(uuid.uuid4())},
        ).status_code
        == 409
    )
    c.put(f"/api/lists/{list_id}/items/{item['id']}", headers=h, json={"checked": True})
    change_plan(c, h, [{**slot, "servings": 4}])
    p = shopping(c, h, list_id)
    assert p["changes"][0]["extra_required"] == 500
    commit_shopping(c, h, p)
    rows = items(c, h, list_id)
    assert next(i for i in rows if i["id"] == item["id"])["checked"]
    extra = next(i for i in rows if i["name"] == "Carrots" and not i["checked"])
    assert extra["quantity"] == 500
    c.put(
        f"/api/lists/{list_id}/items/{extra['id']}", headers=h, json={"quantity": 600}
    )
    change_plan(c, h, [{**slot, "servings": 3}])
    commit_shopping(c, h, shopping(c, h, list_id))
    assert (
        next(i for i in items(c, h, list_id) if i["id"] == extra["id"])["quantity"]
        == 350
    )
    change_plan(c, h, remove_ids=["cook"])
    commit_shopping(c, h, shopping(c, h, list_id))
    rows = items(c, h, list_id)
    assert next(i for i in rows if i["id"] == extra["id"])["quantity"] == 100
    assert next(i for i in rows if i["name"] == "Personal treat")["quantity"] == 2
    assert next(i for i in rows if i["id"] == item["id"])["checked"]


def test_clearing_purchases_retains_completed_quantities(api_client):
    c, f = api_client
    h = bearer(f["jwt"])
    m = recipe(c, h, ingredients=[{"name": "Pasta", "quantity": 100, "unit": "g"}])
    lid = f["own_list_id"]
    slot = {"id": "cook", "day": "2026-09-14", "meal_id": m["id"], "servings": 2}
    change_plan(c, h, [slot])
    commit_shopping(c, h, shopping(c, h, lid))
    item = items(c, h, lid)[0]
    c.put(f"/api/lists/{lid}/items/{item['id']}", headers=h, json={"checked": True})
    c.post(
        f"/api/lists/{lid}/items/clear-checked",
        headers=h,
        json={"item_ids": [item["id"]]},
    )
    change_plan(c, h, [{**slot, "servings": 4}])
    commit_shopping(c, h, shopping(c, h, lid))
    assert items(c, h, lid)[0]["quantity"] == 100


def png(colour):
    data = io.BytesIO()
    Image.new("RGB", (8, 8), colour).save(data, format="PNG")
    return data.getvalue()


def test_photo_order_draft_only_limits_errors_and_credentials(
    api_client, tmp_path, monkeypatch
):
    c, f = api_client
    h = bearer(f["jwt"])
    from config import settings

    monkeypatch.setattr(settings, "DATA_DIR", str(tmp_path))
    with SessionLocal() as db:
        db.add(
            Integration(
                id="vision",
                config={
                    "url": "https://vision.example/v1/chat/completions",
                    "model": "vision",
                },
                secret=encrypt("private-provider-key"),
                enabled=True,
            )
        )
        db.commit()
    observed = []

    async def response(self, url, **kwargs):
        observed.extend(kwargs["json"]["messages"][0]["content"][1:])
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "name": "Photo soup",
                                    "description": None,
                                    "recipe_category": None,
                                    "prep_minutes": None,
                                    "cook_minutes": None,
                                    "tags": None,
                                    "steps": ["Cook."],
                                    "ingredients": [
                                        {
                                            "name": "Salt",
                                            "quantity": None,
                                            "unit": None,
                                            "notes": "to taste",
                                        }
                                    ],
                                }
                            )
                        }
                    }
                ]
            },
        )

    with patch("integrations.validate_endpoint"), patch(
        "httpx.AsyncClient.post", new=response
    ):
        result = c.post(
            "/api/recipes/import/photos",
            headers=h,
            files=[
                ("files", ("one.png", png("red"), "image/png")),
                ("files", ("two.png", png("blue"), "image/png")),
            ],
        )
    assert result.status_code == 200, result.text
    draft = result.json()
    assert len(draft["image_ids"]) == 2 and draft["review_required"]
    assert draft["prep_minutes"] == draft["cook_minutes"] == 0
    assert draft["description"] == draft["recipe_category"] == ""
    assert draft["tags"] == [] and draft["steps"] == ["Cook."]
    assert draft["ingredients"][0]["quantity"] is None
    assert draft["ingredients"][0]["unit"] == ""
    assert draft["ingredients"][0]["notes"] == "to taste"
    assert observed[0] != observed[1]
    with SessionLocal() as db:
        assert db.query(Meal).count() == 0
        images = db.query(RecipeImage).order_by(RecipeImage.sort_order).all()
        assert [i.id for i in images] == draft["image_ids"]
    _, peer = second_user_token()
    assert (
        c.get(
            "/api/recipes/images/" + draft["image_ids"][0], headers=bearer(peer)
        ).status_code
        == 404
    )
    saved = c.post("/api/meals", headers=h, json=draft)
    assert saved.status_code == 201, saved.text
    assert (
        c.get(
            "/api/recipes/images/" + draft["image_ids"][0], headers=bearer(peer)
        ).status_code
        == 200
    )
    assert c.get("/api/integrations", headers=h).status_code == 403
    assert (
        c.post(
            "/api/recipes/import/photos",
            headers=h,
            files=[("files", ("bad.png", b"bad", "image/png"))],
        ).status_code
        == 422
    )
    assert (
        c.post(
            "/api/recipes/import/photos",
            headers=h,
            files=[("files", ("big.png", b"x" * (10 * 1024 * 1024 + 1), "image/png"))],
        ).status_code
        == 413
    )
    assert (
        c.post(
            "/api/recipes/import/photos",
            headers=h,
            files=[("files", ("a.png", png("red"), "image/png"))] * 6,
        ).status_code
        == 422
    )

    async def broken(self, url, **kwargs):
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={"choices": [{"message": {"content": "not JSON"}}]},
        )

    with patch("integrations.validate_endpoint"), patch(
        "httpx.AsyncClient.post", new=broken
    ):
        assert (
            c.post(
                "/api/recipes/import/photos",
                headers=h,
                files=[("files", ("a.png", png("red"), "image/png"))],
            ).status_code
            == 502
        )


@pytest.mark.parametrize(
    "scenario,status,code,message,reason",
    [
        ("http", 429, "credit_balance_exhausted", "API credits", "credits"),
        ("http", 429, "insufficient_quota", "API credits", "credits"),
        (
            "http",
            429,
            "project_spend_limit_exceeded",
            "spending or usage limit",
            "spend_limit",
        ),
        ("http", 401, "invalid_api_key", "API key", "credentials"),
        ("http", 429, "rate_limit_exceeded", "rate limiting", "rate_limit"),
        ("http", 400, "invalid_request", "rejected the request", "request_rejected"),
        ("http", 503, "unavailable", "unavailable", "provider_unavailable"),
        ("timeout", 200, None, "too long", "timeout"),
        ("malformed", 200, None, "readable recipe", "invalid_response"),
        ("invalid", 200, None, "ingredients.0.quantity", "invalid_recipe"),
        ("truncated", 200, None, "response limit", "truncated"),
    ],
)
def test_photo_failures_are_actionable_without_leaking_provider_data(
    api_client, tmp_path, monkeypatch, caplog, scenario, status, code, message, reason
):
    c, f = api_client
    h = bearer(f["jwt"])
    from config import settings

    monkeypatch.setattr(settings, "DATA_DIR", str(tmp_path))
    secret = "private-provider-key"
    with SessionLocal() as db:
        db.add(
            Integration(
                id="vision",
                config={"url": "https://vision.example/chat", "model": "vision"},
                secret=encrypt(secret),
                enabled=True,
            )
        )
        db.commit()

    async def response(self, url, **kwargs):
        request = httpx.Request("POST", url)
        if scenario == "timeout":
            raise httpx.ReadTimeout(secret, request=request)
        if scenario == "http":
            payload = {"error": {"code": code, "message": "Credential: " + secret}}
        else:
            content = secret
            if scenario == "invalid":
                content = json.dumps(
                    {
                        "name": "Soup",
                        "ingredients": [{"name": "Salt", "quantity": secret}],
                    }
                )
            payload = {
                "choices": [
                    {
                        "finish_reason": (
                            "length" if scenario == "truncated" else "stop"
                        ),
                        "message": {"content": content},
                    }
                ]
            }
        return httpx.Response(
            status,
            request=request,
            headers={"x-request-id": "req_safe123"},
            json=payload,
        )

    with patch("integrations.validate_endpoint"), patch(
        "httpx.AsyncClient.post", new=response
    ):
        result = c.post(
            "/api/recipes/import/photos",
            headers=h,
            files=[("files", ("recipe.png", png("red"), "image/png"))],
        )
    assert result.status_code == 502
    assert message in result.json()["detail"]
    assert f"reason={reason}" in caplog.text
    assert secret not in result.text and secret not in caplog.text
    if scenario != "timeout":
        assert "request_id=req_safe123" in caplog.text
    with SessionLocal() as db:
        assert db.query(Meal).count() == db.query(RecipeImage).count() == 0


def test_admin_secrets_encrypted_and_interactive_only(
    api_client, tmp_path, monkeypatch
):
    c, f = api_client
    _, token = second_user_token("admin", True)
    h = bearer(token)
    from config import settings

    monkeypatch.setattr(settings, "DATA_DIR", str(tmp_path))
    key = create_key(c, token, "read,write")
    with patch("routers.integrations_router.validate_endpoint"):
        response = c.put(
            "/api/integrations/vision",
            headers=h,
            json={
                "url": "https://example.com/chat",
                "secret": "hidden-secret",
                "model": "vision",
                "enabled": True,
            },
        )
    assert response.status_code == 200, response.text
    assert "hidden-secret" not in response.text
    assert c.get("/api/integrations", headers=bearer(key)).status_code == 401
    with SessionLocal() as db:
        secret = db.get(Integration, "vision").secret
        assert secret != "hidden-secret" and decrypt(secret) == "hidden-secret"
    assert (tmp_path / "integration.key").stat().st_mode & 0o777 == 0o600


def test_calendar_dst_free_ownership_and_escape(api_client):
    c, f = api_client
    h = bearer(f["jwt"])
    m = recipe(c, h)
    with SessionLocal() as db:
        db.add(PlannerState(id="global", settings={"timezone": "Europe/London"}))
        db.commit()
        hours = []
        for day in ["2026-03-28", "2026-03-29", "2026-10-24", "2026-10-25"]:
            slot = PlannerSlot(
                id="slot",
                day=day,
                time="18:30",
                meal_type="dinner",
                kind="recipe",
                meal_id=m["id"],
                duration=60,
                servings=2,
                notes="Hello,\nworld;",
            )
            raw = event_content(slot, db, "stable-id", "installation")
            event = Calendar.from_ical(raw).walk("VEVENT")[0]
            hours.append(event.decoded("dtstart").hour)
            assert event["TRANSP"] == "TRANSPARENT" and "ATTENDEE" not in event
            assert not event.subcomponents
            assert owns_event(raw, "stable-id", "installation") and not owns_event(
                raw, "other", "installation"
            )
        assert hours == [18, 17, 17, 18]


def test_calendar_worker_create_conflict_reconcile_delete_and_auth_pause(
    api_client, tmp_path, monkeypatch
):
    c, f = api_client
    h = bearer(f["jwt"])
    m = recipe(c, h)
    from config import settings

    monkeypatch.setattr(settings, "DATA_DIR", str(tmp_path))
    # No live provider: a deterministic DAV protocol double exercises durable records.
    change_plan(c, h, [{"id": "cook", "day": "2026-09-14", "meal_id": m["id"]}])
    with SessionLocal() as db:
        db.add(
            Integration(
                id="nextcloud",
                config={
                    "url": "https://cloud.example/",
                    "username": "user",
                    "calendar_url": "https://cloud.example/cal/",
                    "installation": "install",
                },
                secret=encrypt("secret"),
                enabled=True,
            )
        )
        db.commit()
    resources = {}
    calls = []
    fail = {"conflict": True, "auth": False}

    class FakeDAV:
        def __init__(self, *args):
            pass

        def close(self):
            pass

        def request(self, method, href, **kwargs):
            calls.append(method)
            status = 200
            headers = {}
            body = b""
            if fail["auth"]:
                status = 401
            elif method == "GET":
                if href not in resources:
                    status = 404
                else:
                    body = resources[href]
                    headers = {"etag": '"1"'}
            elif method == "PUT":
                if fail["conflict"]:
                    status = 412
                    fail["conflict"] = False
                else:
                    resources[href] = kwargs["content"]
                    status = 201
                    headers = {"etag": '"2"'}
            elif method == "DELETE":
                resources.pop(href, None)
                status = 204
            return httpx.Response(
                status,
                request=httpx.Request(method, href),
                headers=headers,
                content=body,
            )

    with patch("integrations.DAV", FakeDAV):
        process_sync()
        assert len(resources) == 1 and calls.count("PUT") == 2
        with SessionLocal() as db:
            assert (
                db.query(CalendarJob).count() == 0
                and db.query(CalendarEvent).count() == 1
            )
            remote = db.query(CalendarEvent).one()
            uid = remote.uid
            db.add(CalendarJob(slot_id="cook"))
            db.commit()
        resources.clear()
        process_sync()
        assert len(resources) == 1
        with SessionLocal() as db:
            assert db.query(CalendarEvent).one().uid == uid
        change_plan(c, h, remove_ids=["cook"])
        process_sync()
        assert resources == {}
        change_plan(c, h, [{"id": "cook", "day": "2026-09-14", "meal_id": m["id"]}])
        fail["auth"] = True
        process_sync()
        with SessionLocal() as db:
            assert (
                db.get(Integration, "nextcloud").paused
                and db.query(CalendarJob).count() == 1
            )
        count = len(calls)
        process_sync()
        assert len(calls) == count


def test_generation_merges_metric_units_and_retains_incompatible_and_notes(api_client):
    c, f = api_client
    h = bearer(f["jwt"])
    one = recipe(
        c,
        h,
        name="Roast",
        ingredients=[
            {"name": "Carrots", "quantity": 1, "unit": "kg", "notes": "peeled"}
        ],
    )
    two = recipe(
        c,
        h,
        name="Soup",
        ingredients=[
            {"name": "Carrots", "quantity": 200, "unit": "g", "notes": "diced"}
        ],
    )
    three = recipe(
        c,
        h,
        name="Salad",
        ingredients=[
            {"name": "Carrots", "quantity": 2, "unit": "each", "notes": "grated"}
        ],
    )
    change_plan(
        c,
        h,
        [
            {"id": m["id"], "day": f"2026-09-{14+i}", "meal_id": m["id"], "servings": 2}
            for i, m in enumerate([one, two, three])
        ],
    )
    preview = shopping(c, h, f["own_list_id"])
    assert len(preview["requirements"]) == 2
    grams = next(r for r in preview["requirements"] if r["unit"] == "g")
    assert grams["quantity"] == 1200
    assert {s["notes"] for s in grams["sources"]} == {"peeled", "diced"}
    assert (
        next(r for r in preview["requirements"] if r["unit"] == "each")["quantity"] == 2
    )


def test_review_replay_and_request_id_reuse(api_client):
    c, f = api_client
    h = bearer(f["jwt"])
    m = recipe(c, h)
    data = {
        "expected_version": plan(c, h)["version"],
        "slots": [{"id": "cook", "day": "2026-09-14", "meal_id": m["id"]}],
    }
    preview = c.post("/api/planner/preview", headers=h, json=data).json()
    request = {"token": preview["token"], "request_id": str(uuid.uuid4())}
    result = c.post("/api/planner/commit", headers=h, json=request)
    assert result.status_code == 200
    assert (
        c.post("/api/planner/commit", headers=h, json=request).json() == result.json()
    )
    second = c.post(
        "/api/planner/preview",
        headers=h,
        json={"expected_version": plan(c, h)["version"], "slots": []},
    ).json()
    assert (
        c.post(
            "/api/planner/commit", headers=h, json={**request, "token": second["token"]}
        ).status_code
        == 409
    )
    preview = shopping(c, h, f["own_list_id"])
    request = {"token": preview["token"], "request_id": str(uuid.uuid4())}
    result = c.post("/api/planner/shopping/commit", headers=h, json=request)
    assert result.status_code == 200, result.text
    assert (
        c.post("/api/planner/shopping/commit", headers=h, json=request).json()
        == result.json()
    )


def test_suggestions_explicit_diet_history_repeat_and_no_duplicates(api_client):
    c, f = api_client
    h = bearer(f["jwt"])
    excluded = recipe(c, h, name="Old vegetarian")
    repeat = recipe(c, h, name="Weekly fish", tags=["fish"], allow_weekly_repeat=True)
    neutral = recipe(c, h, name="Neutral", tags=[])
    change_plan(
        c,
        h,
        [
            {"id": "old", "day": "2026-09-07", "meal_id": excluded["id"]},
            {"id": "repeat", "day": "2026-09-08", "meal_id": repeat["id"]},
        ],
    )
    result = c.post(
        "/api/planner/suggestions",
        headers=h,
        json={
            "expected_version": plan(c, h)["version"],
            "week": "2026-09-14",
            "fish": 1,
            "vegetarian": 1,
        },
    ).json()
    chosen = [s["meal_id"] for s in result["slots"] if s["day"] >= "2026-09-14"]
    assert set(chosen) == {repeat["id"], neutral["id"]} and len(chosen) == len(
        set(chosen)
    )
    assert result["unmet"] == {"vegetarian": 1}


def test_grocery_generation_preserves_renamed_or_reunitised_personal_items(api_client):
    c, f = api_client
    h = bearer(f["jwt"])
    m = recipe(c, h, ingredients=[{"name": "Carrots", "quantity": 500, "unit": "g"}])
    lid = f["own_list_id"]
    slot = {"id": "cook", "day": "2026-09-14", "meal_id": m["id"], "servings": 2}
    change_plan(c, h, [slot])
    commit_shopping(c, h, shopping(c, h, lid))
    item = items(c, h, lid)[0]
    c.put(
        f"/api/lists/{lid}/items/{item['id']}",
        headers=h,
        json={"quantity": 1, "unit": "kg"},
    )
    change_plan(c, h, [{**slot, "servings": 4}])
    preview = shopping(c, h, lid)
    assert preview["changes"][0]["manual_item_retained"]
    commit_shopping(c, h, preview)
    rows = items(c, h, lid)
    assert {(r["quantity"], r["unit"]) for r in rows} == {(1, "kg"), (1000, "g")}


def test_pdf_csv_escape_and_cover_content(api_client, tmp_path, monkeypatch):
    from pypdf import PdfReader
    import csv

    c, f = api_client
    h = bearer(f["jwt"])
    from config import settings

    monkeypatch.setattr(settings, "DATA_DIR", str(tmp_path))
    cover = c.post(
        "/api/recipes/images",
        headers=h,
        files={"file": ("cover.png", png("green"), "image/png")},
    ).json()
    meal = recipe(
        c,
        h,
        name="=SUM(1,2)",
        steps=['Fold <flour> & stir; "gently".'],
        image_ids=cover["image_ids"],
    )
    response = c.get(
        f"/api/recipes/{meal['id']}/export?format=pdf&servings=4", headers=h
    )
    pdf = PdfReader(io.BytesIO(response.content))
    text = "\n".join(page.extract_text() for page in pdf.pages)
    assert 'Fold <flour> & stir; "gently".' in text
    assert "1000.0 g Carrots" in text
    assert len(pdf.pages[0].images) == 1
    exported = c.get("/api/recipes/export?format=csv", headers=h)
    rows = list(csv.reader(io.StringIO(exported.content.decode("utf-8-sig"))))
    assert rows[1][1] == "'=SUM(1,2)"
    assert 'Fold <flour> & stir; "gently".' in rows[1][7]
    assert cover["image_ids"][0] in rows[1][8]
