import uuid

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from auth import create_access_token, hash_password
from database import Base, SessionLocal, engine
from main import app
from models import ApiKey, ListMember, ShoppingList, User


@pytest.fixture()
def api_client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    user = User(
        id=str(uuid.uuid4()),
        username="agent-owner",
        email="agent-owner@example.com",
        display_name="Agent Owner",
        password_hash=hash_password("correct-horse-battery-staple"),
        is_admin=False,
    )
    other = User(
        id=str(uuid.uuid4()),
        username="other-owner",
        email="other-owner@example.com",
        display_name="Other Owner",
        password_hash=hash_password("correct-horse-battery-staple"),
    )
    own_list = ShoppingList(id=str(uuid.uuid4()), name="Own list", owner_id=user.id)
    viewer_list = ShoppingList(id=str(uuid.uuid4()), name="Viewer list", owner_id=other.id)
    editor_list = ShoppingList(id=str(uuid.uuid4()), name="Editor list", owner_id=other.id)
    db.add_all([user, other, own_list, viewer_list, editor_list])
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


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _create_key(client, jwt, scopes="read,write"):
    response = client.post(
        "/api/auth/api-keys",
        headers=_bearer(jwt),
        json={"name": f"{scopes} test key", "scopes": scopes},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_non_admin_can_create_key_and_read_scope_cannot_write(api_client):
    client, fixture = api_client
    created = _create_key(client, fixture["jwt"], "read")
    key_headers = _bearer(created["key"])

    listed = client.get("/api/lists", headers=key_headers)
    assert listed.status_code == 200
    assert {item["name"] for item in listed.json()} == {"Own list", "Viewer list", "Editor list"}

    denied = client.post("/api/lists", headers=key_headers, json={"name": "Must not exist"})
    assert denied.status_code == 403
    assert denied.json() == {"detail": "API key missing required scope: write"}

    db = SessionLocal()
    try:
        stored = db.query(ApiKey).filter(ApiKey.id == created["id"]).one()
        assert stored.last_used is not None
    finally:
        db.close()


def test_read_write_key_obeys_list_roles_and_supports_item_crud(api_client):
    client, fixture = api_client
    created = _create_key(client, fixture["jwt"])
    headers = _bearer(created["key"])

    viewer_denied = client.post(
        f"/api/lists/{fixture['viewer_list_id']}/items",
        headers=headers,
        json={"name": "Milk"},
    )
    assert viewer_denied.status_code == 403
    assert viewer_denied.json() == {"detail": "View-only access"}

    added = client.post(
        f"/api/lists/{fixture['editor_list_id']}/items",
        headers=headers,
        json={"name": "Milk", "quantity": 2, "unit": "pints"},
    )
    assert added.status_code == 201, added.text
    item = added.json()
    assert item["name"] == "Milk"

    checked = client.put(
        f"/api/lists/{fixture['editor_list_id']}/items/{item['id']}",
        headers=headers,
        json={"checked": True},
    )
    assert checked.status_code == 200
    assert checked.json()["checked"] is True

    removed = client.delete(
        f"/api/lists/{fixture['editor_list_id']}/items/{item['id']}",
        headers=headers,
    )
    assert removed.status_code == 204


def test_key_lifecycle_validation_and_sensitive_endpoint_rejection(api_client):
    client, fixture = api_client

    invalid_scope = client.post(
        "/api/auth/api-keys",
        headers=_bearer(fixture["jwt"]),
        json={"name": "Bad key", "scopes": "admin"},
    )
    assert invalid_scope.status_code == 422

    created = _create_key(client, fixture["jwt"])
    key_headers = _bearer(created["key"])
    assert client.get("/api/auth/me", headers=key_headers).status_code == 401
    assert client.get("/api/lists", headers=_bearer(created["key_prefix"])).status_code == 401

    deleted = client.delete(
        f"/api/auth/api-keys/{created['id']}", headers=_bearer(fixture["jwt"])
    )
    assert deleted.status_code == 204
    assert client.get("/api/lists", headers=key_headers).status_code == 401


def test_invalid_category_is_rejected(api_client):
    client, fixture = api_client
    created = _create_key(client, fixture["jwt"])
    response = client.post(
        f"/api/lists/{fixture['own_list_id']}/items",
        headers=_bearer(created["key"]),
        json={"name": "Milk", "category_id": "missing-category"},
    )
    assert response.status_code == 422
    assert response.json() == {"detail": "Category not found"}


def test_websocket_accepts_read_scoped_api_key(api_client):
    client, fixture = api_client
    created = _create_key(client, fixture["jwt"], "read")
    with client.websocket_connect(f"/ws/{fixture['own_list_id']}") as websocket:
        websocket.send_json({"type": "auth", "token": created["key"]})
        assert websocket.receive_json() == {"type": "auth_ok"}


def test_agent_discovery_and_openapi_are_complete(api_client):
    client, _ = api_client
    context = client.get("/api/context")
    assert context.status_code == 200
    operations = {
        (entry["method"], entry["path"]): entry for entry in context.json()["operations"]
    }
    expected = {
        (method, route.path)
        for route in app.routes
        if isinstance(route, APIRoute) and route.path.startswith("/api")
        for method in (route.methods or set()) - {"HEAD", "OPTIONS"}
    }
    assert set(operations) == expected
    operation_ids = [entry["operation_id"] for entry in context.json()["operations"]]
    assert len(operation_ids) == len(set(operation_ids))
    assert ("POST", "/api/lists/{list_id}/items/reorder") in operations
    assert ("POST", "/api/lists/{list_id}/items/import-recipe") in operations
    assert ("GET", "/api/favourites") in operations

    schema = client.get("/api/openapi.json")
    assert schema.status_code == 200
    paths = schema.json()["paths"]
    openapi_operations = {
        (method.upper(), path)
        for path, path_item in paths.items()
        for method in path_item
        if method.upper() in {"GET", "POST", "PUT", "DELETE", "PATCH"}
    }
    assert openapi_operations == expected
    assert paths["/api/lists"]["get"]["x-kitchen-cupboard-auth"]["api_key_scope"] == "read"
    assert paths["/api/lists"]["post"]["x-kitchen-cupboard-auth"]["api_key_scope"] == "write"
    assert paths["/api/auth/me"]["get"]["x-kitchen-cupboard-auth"] == {"accepted": ["jwt"]}
    assert "API keys are never exchanged" in schema.json()["components"]["securitySchemes"]["HTTPBearer"]["description"]

    swagger = client.get("/api/docs")
    assert swagger.status_code == 200
    assert "/api/openapi.json" in swagger.text
    assert "https://cdn.jsdelivr.net" in swagger.headers["content-security-policy"]
    assert "https://cdn.jsdelivr.net" not in context.headers["content-security-policy"]

    guide = client.get("/api/agent-guide")
    assert guide.status_code == 200
    assert "Do not send an API key" in guide.text
    unknown = client.get("/api/does-not-exist")
    assert unknown.status_code == 404
    assert unknown.json()["detail"] in {"Not Found", "API endpoint not found"}
