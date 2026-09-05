import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from auth import create_access_token, hash_password
from database import Base, SessionLocal, engine
from main import app
from models import AuditLog, Ingredient, ListItem, ListMember, ShoppingList, User


@pytest.fixture()
def api_client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    user = User(
        username="library-owner",
        email="library-owner@example.com",
        display_name="Library Owner",
        password_hash=hash_password("correct-horse-battery-staple"),
    )
    other = User(
        username="list-owner",
        email="list-owner@example.com",
        display_name="List Owner",
        password_hash=hash_password("correct-horse-battery-staple"),
    )
    db.add_all([user, other])
    db.flush()
    own_list = ShoppingList(name="Own list", owner_id=user.id)
    viewer_list = ShoppingList(name="Viewer list", owner_id=other.id)
    editor_list = ShoppingList(name="Editor list", owner_id=other.id)
    db.add_all([own_list, viewer_list, editor_list])
    db.flush()
    db.add_all([
        ListMember(list_id=viewer_list.id, user_id=user.id, role="viewer"),
        ListMember(list_id=editor_list.id, user_id=user.id, role="editor"),
    ])
    db.commit()
    fixture = {
        "user_id": user.id,
        "jwt": create_access_token({"sub": user.id}),
        "own_list_id": own_list.id,
        "viewer_list_id": viewer_list.id,
        "editor_list_id": editor_list.id,
    }
    db.close()
    with TestClient(app) as client:
        yield client, fixture


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def second_user_token(username="library-peer", admin=False):
    db = SessionLocal()
    try:
        user = User(
            username=username,
            email=f"{username}@example.com",
            display_name=username.title(),
            password_hash=hash_password("correct-horse-battery-staple"),
            is_admin=admin,
        )
        db.add(user)
        db.commit()
        return user.id, create_access_token({"sub": user.id})
    finally:
        db.close()


def create_key(client, jwt, scopes):
    response = client.post(
        "/api/auth/api-keys",
        headers=bearer(jwt),
        json={"name": f"Library {scopes}", "scopes": scopes},
    )
    assert response.status_code == 201
    return response.json()["key"]


def test_global_catalogue_is_shared_scoped_and_versioned(api_client):
    client, fixture = api_client
    peer_id, peer_jwt = second_user_token()
    read_key = create_key(client, peer_jwt, "read")
    write_key = create_key(client, peer_jwt, "read,write")

    created = client.post(
        "/api/ingredients",
        headers=bearer(fixture["jwt"]),
        json={"name": "  ChickPEAS  ", "default_unit": "tin"},
    )
    assert created.status_code == 201, created.text
    ingredient = created.json()
    assert ingredient["name"] == "ChickPEAS"
    assert ingredient["normalized_name"] == "chickpeas"

    visible = client.get("/api/ingredients", headers=bearer(read_key))
    assert [entry["id"] for entry in visible.json()] == [ingredient["id"]]
    assert client.post(
        "/api/ingredients", headers=bearer(read_key), json={"name": "Denied"}
    ).status_code == 403

    updated = client.put(
        f"/api/ingredients/{ingredient['id']}",
        headers=bearer(write_key),
        json={"expected_version": 1, "default_unit": "cans"},
    )
    assert updated.status_code == 200
    assert updated.json()["updated_by"] == peer_id
    assert updated.json()["version"] == 2
    conflict = client.put(
        f"/api/ingredients/{ingredient['id']}",
        headers=bearer(fixture["jwt"]),
        json={"expected_version": 1, "default_unit": "tin"},
    )
    assert conflict.status_code == 409

    forbidden = client.request(
        "DELETE",
        f"/api/ingredients/{ingredient['id']}",
        headers=bearer(peer_jwt),
        json={"expected_version": 2},
    )
    assert forbidden.status_code == 403


def test_meal_inline_resolution_validation_archive_and_admin_restore(api_client):
    client, fixture = api_client
    _, admin_jwt = second_user_token("library-admin", admin=True)

    duplicate = client.post(
        "/api/meals",
        headers=bearer(fixture["jwt"]),
        json={
            "name": "Invalid",
            "base_servings": 2,
            "ingredients": [
                {"name": " Olive   Oil ", "quantity": 1, "unit": "tbsp"},
                {"name": "olive oil", "quantity": 2, "unit": "tbsp"},
            ],
        },
    )
    assert duplicate.status_code == 422
    db = SessionLocal()
    try:
        assert db.query(Ingredient).filter(Ingredient.normalized_name == "olive oil").count() == 0
    finally:
        db.close()

    created = client.post(
        "/api/meals",
        headers=bearer(fixture["jwt"]),
        json={
            "name": "Soup",
            "description": "Simple",
            "base_servings": 2,
            "ingredients": [
                {"name": " Carrots ", "quantity": 4, "unit": "each"},
                {"name": "Salt", "quantity": 1, "unit": "pinch", "scales_with_servings": False},
            ],
        },
    )
    assert created.status_code == 201, created.text
    meal = created.json()
    carrot_id = meal["ingredients"][0]["ingredient_id"]

    archived = client.request(
        "DELETE",
        f"/api/ingredients/{carrot_id}",
        headers=bearer(fixture["jwt"]),
        json={"expected_version": 1},
    )
    assert archived.status_code == 200
    still_visible = client.get(f"/api/meals/{meal['id']}", headers=bearer(fixture["jwt"])).json()
    assert still_visible["ingredients"][0]["ingredient_archived"] is True
    rejected = client.post(
        "/api/meals",
        headers=bearer(fixture["jwt"]),
        json={"name": "Cannot select", "ingredients": [{"ingredient_id": carrot_id}]},
    )
    assert rejected.status_code == 422

    admin_key = create_key(client, admin_jwt, "read,write")
    assert client.get(
        "/api/ingredients?include_archived=true", headers=bearer(admin_key)
    ).status_code == 403
    assert client.post(
        f"/api/ingredients/{carrot_id}/restore",
        headers=bearer(admin_key),
        json={"expected_version": archived.json()["version"]},
    ).status_code == 401

    restored = client.post(
        f"/api/ingredients/{carrot_id}/restore",
        headers=bearer(admin_jwt),
        json={"expected_version": archived.json()["version"]},
    )
    assert restored.status_code == 200
    assert restored.json()["is_archived"] is False


def test_preview_subset_smart_merge_checked_restore_and_idempotency(api_client):
    client, fixture = api_client
    headers = bearer(fixture["jwt"])
    existing_salt = client.post(
        f"/api/lists/{fixture['own_list_id']}/items",
        headers=headers,
        json={"name": " salt ", "quantity": 2, "unit": "PINCH", "notes": "keep me"},
    ).json()
    client.put(
        f"/api/lists/{fixture['own_list_id']}/items/{existing_salt['id']}",
        headers=headers,
        json={"checked": True},
    )
    client.post(
        f"/api/lists/{fixture['own_list_id']}/items",
        headers=headers,
        json={"name": "Carrots", "quantity": 1, "unit": "kg"},
    )
    meal = client.post(
        "/api/meals",
        headers=headers,
        json={
            "name": "Soup", "base_servings": 2,
            "ingredients": [
                {"name": "Salt", "quantity": 1, "unit": "pinch", "notes": "replace me"},
                {"name": "Carrots", "quantity": 500, "unit": "g"},
                {"name": "Stock cube", "quantity": 1, "unit": "each", "scales_with_servings": False},
            ],
        },
    ).json()
    preview = client.post(
        f"/api/meals/{meal['id']}/preview",
        headers=headers,
        json={"list_id": fixture["own_list_id"], "target_servings": 4},
    )
    assert preview.status_code == 200, preview.text
    rows = preview.json()["rows"]
    assert [(row["name"], row["quantity"]) for row in rows] == [
        ("Salt", 2.0), ("Carrots", 1000.0), ("Stock cube", 1.0),
    ]
    assert rows[0]["selected"] is False
    assert rows[1]["selected"] is True  # a different unit does not match

    request_id = str(uuid.uuid4())
    body = {
        "list_id": fixture["own_list_id"],
        "target_servings": 4,
        "source_version": meal["version"],
        "selected_source_row_ids": [row["source_row_id"] for row in rows],
        "request_id": request_id,
    }
    committed = client.post(f"/api/meals/{meal['id']}/commit", headers=headers, json=body)
    assert committed.status_code == 200, committed.text
    assert committed.json()["added_count"] == 2
    assert committed.json()["updated_count"] == 1
    replay = client.post(f"/api/meals/{meal['id']}/commit", headers=headers, json=body)
    assert replay.status_code == 200
    assert replay.json() == committed.json()
    changed = {**body, "selected_source_row_ids": body["selected_source_row_ids"][:1]}
    assert client.post(f"/api/meals/{meal['id']}/commit", headers=headers, json=changed).status_code == 409

    items = client.get(
        f"/api/lists/{fixture['own_list_id']}/items", headers=headers
    ).json()
    salt = next(item for item in items if item["id"] == existing_salt["id"])
    assert salt["quantity"] == 4
    assert salt["checked"] is False
    assert salt["notes"] == "keep me"
    carrots = [item for item in items if item["name"].casefold() == "carrots"]
    assert {item["unit"] for item in carrots} == {"kg", "g"}

    updated_meal = client.put(
        f"/api/meals/{meal['id']}",
        headers=headers,
        json={
            "expected_version": meal["version"],
            "name": meal["name"],
            "description": meal["description"],
            "base_servings": meal["base_servings"],
            "source_url": meal["source_url"],
            "ingredients": [
                {
                    "ingredient_id": row["ingredient_id"],
                    "quantity": row["quantity"],
                    "unit": row["unit"],
                    "category_id": row["category_id"],
                    "notes": row["notes"],
                    "scales_with_servings": row["scales_with_servings"],
                }
                for row in meal["ingredients"]
            ],
        },
    )
    assert updated_meal.status_code == 200
    before_conflict = len(items)
    stale_commit = client.post(
        f"/api/meals/{meal['id']}/commit",
        headers=headers,
        json={**body, "request_id": str(uuid.uuid4())},
    )
    assert stale_commit.status_code == 409
    assert len(client.get(f"/api/lists/{fixture['own_list_id']}/items", headers=headers).json()) == before_conflict

    viewer = client.post(
        f"/api/meals/{meal['id']}/commit",
        headers=headers,
        json={**body, "list_id": fixture["viewer_list_id"], "request_id": str(uuid.uuid4())},
    )
    assert viewer.status_code == 403


def test_basics_collection_versions_reorder_and_auditing(api_client):
    client, fixture = api_client
    headers = bearer(fixture["jwt"])
    basics = client.get("/api/basics", headers=headers).json()
    first = client.post(
        "/api/basics/items",
        headers=headers,
        json={"expected_version": basics["version"], "name": "Milk", "quantity": 1, "unit": "l"},
    )
    assert first.status_code == 201, first.text
    current = client.get("/api/basics", headers=headers).json()
    stale = client.post(
        "/api/basics/items",
        headers=headers,
        json={"expected_version": basics["version"], "name": "Bread", "quantity": 1},
    )
    assert stale.status_code == 409
    second = client.post(
        "/api/basics/items",
        headers=headers,
        json={"expected_version": current["version"], "name": "Bread", "quantity": 1},
    )
    assert second.status_code == 201
    current = client.get("/api/basics", headers=headers).json()
    reordered = client.post(
        "/api/basics/reorder",
        headers=headers,
        json={
            "expected_version": current["version"],
            "item_ids": [second.json()["id"], first.json()["id"]],
        },
    )
    assert [item["id"] for item in reordered.json()["items"]] == [second.json()["id"], first.json()["id"]]

    db = SessionLocal()
    try:
        actions = {entry.action for entry in db.query(AuditLog).all()}
        assert {"basics.create", "basics.reorder", "ingredient.create"}.issubset(actions)
    finally:
        db.close()


def test_url_recipe_can_be_saved_as_global_meal(api_client):
    client, fixture = api_client
    parsed = {
        "title": "Imported curry",
        "source": "Example Kitchen",
        "ingredients": [{"name": "Lentils", "quantity": 250, "unit": "g"}],
    }
    with patch("routers.library_router.fetch_recipe", new=AsyncMock(return_value=parsed)):
        preview = client.post(
            "/api/meals/import-recipe/preview",
            headers=bearer(fixture["jwt"]),
            json={"url": "https://example.com/curry", "base_servings": 4},
        )
        assert preview.status_code == 200
        created = client.post(
            "/api/meals/import-recipe",
            headers=bearer(fixture["jwt"]),
            json={"url": "https://example.com/curry", "base_servings": 4},
        )
    assert created.status_code == 201, created.text
    assert created.json()["name"] == "Imported curry"
    assert created.json()["base_servings"] == 4
    assert created.json()["ingredients"][0]["name"] == "Lentils"
