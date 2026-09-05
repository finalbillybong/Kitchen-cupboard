import json
import os

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse

from auth import api_key_has_scope, record_api_key_use, resolve_token
from config import settings
from database import engine, get_db, Base
from models import User, ListMember, ShoppingList
from seed import seed_categories
from websocket_manager import manager
from routers import (
    auth_router,
    categories_router,
    lists_router,
    items_router,
    suggestions_router,
    favourites_router,
)

# Ensure data directory exists
os.makedirs("data", exist_ok=True)

# Create tables
Base.metadata.create_all(bind=engine)

# Seed default categories
db = next(get_db())
seed_categories(db)
db.close()

API_DESCRIPTION = """
Kitchen Cupboard's REST API supports shopping lists, items, categories, suggestions,
favourites, sharing, and recipe imports.

**Agent authentication:** create an API key while signed in, then send the full key
directly on resource requests as `Authorization: Bearer kc_...`. Do not send an API
key to `/api/auth/login`; that endpoint exchanges a username and password for a JWT.

Use `/api/context` for a concise machine-readable capability index and
`/api/agent-guide` for a plain-text quick start.
"""

TAGS_METADATA = [
    {"name": "Health", "description": "Service health and API discovery."},
    {"name": "AI Context", "description": "Machine-readable and plain-text agent guidance."},
    {"name": "Authentication", "description": "JWT sessions, per-user API keys, and admin operations."},
    {"name": "Shopping Lists", "description": "Create, read, update, share, archive, and delete lists."},
    {"name": "List Items", "description": "Manage, reorder, import, check, and clear list items."},
    {"name": "Categories", "description": "Read default categories and manage user-created categories."},
    {"name": "Suggestions", "description": "Search remembered item/category combinations."},
    {"name": "Favourites", "description": "Retrieve frequently used items."},
]


def _operation_id(route: APIRoute) -> str:
    """Keep tool-friendly operation IDs stable when paths are reorganised."""
    return route.name


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=API_DESCRIPTION,
    openapi_tags=TAGS_METADATA,
    generate_unique_id_function=_operation_id,
    # Documentation is intentionally public; protected operations still require auth.
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ─── CORS ───────────────────────────────────────────────────────────
# Same-origin is the secure default. CORS_ORIGINS can opt browser-hosted agents
# into specific origins. API keys used by curl or server-side clients are not subject to CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=bool(settings.cors_origins and "*" not in settings.cors_origins),
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# ─── Security headers ──────────────────────────────────────────────

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    if request.url.path == "/sw.js":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["CDN-Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    if request.url.path in {"/api/docs", "/api/redoc"}:
        # FastAPI's generated documentation loads its renderer from jsDelivr.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "img-src 'self' data: https://fastapi.tiangolo.com; connect-src 'self'; font-src 'self'"
        )
    else:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; connect-src 'self' wss: ws:; font-src 'self'"
        )
    return response

# ─── Routers ────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(categories_router)
app.include_router(lists_router)
app.include_router(items_router)
app.include_router(suggestions_router)
app.include_router(favourites_router)


# ─── Health / Context ───────────────────────────────────────────────

@app.get("/api/", tags=["Health"])
def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "documentation": {
            "swagger": "/api/docs",
            "openapi": "/api/openapi.json",
            "agent_context": "/api/context",
            "agent_guide": "/api/agent-guide",
        },
    }


@app.get("/api/registration-status", tags=["Health"])
def registration_status():
    """Public endpoint for the frontend to check registration policy."""
    return {
        "open": settings.REGISTRATION_ENABLED,
        "invite_required": not settings.REGISTRATION_ENABLED,
    }


def _dependency_names(route: APIRoute) -> set[str]:
    names = set()
    pending = list(route.dependant.dependencies)
    while pending:
        dependency = pending.pop()
        if dependency.call:
            names.add(getattr(dependency.call, "__name__", str(dependency.call)))
        pending.extend(dependency.dependencies)
    return names


def _route_auth(route: APIRoute) -> dict:
    if route.name == "refresh":
        return {"accepted": ["refresh_cookie"]}
    names = _dependency_names(route)
    if "get_current_user_write" in names:
        return {"accepted": ["jwt", "api_key"], "api_key_scope": "write"}
    if "get_current_user_read" in names:
        return {"accepted": ["jwt", "api_key"], "api_key_scope": "read"}
    if "get_current_admin_jwt" in names:
        return {"accepted": ["jwt"], "admin_required": True}
    if "get_current_user_jwt" in names:
        return {"accepted": ["jwt"]}
    return {"accepted": ["public"]}


def _api_operations(request: Request) -> list[dict]:
    operations = []
    for route in request.app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith("/api"):
            continue
        for method in sorted((route.methods or set()) - {"HEAD", "OPTIONS"}):
            operations.append({
                "operation_id": route.name,
                "method": method,
                "path": route.path,
                "summary": route.summary or route.name.replace("_", " ").title(),
                "authentication": _route_auth(route),
            })
    return sorted(operations, key=lambda item: (item["path"], item["method"]))


@app.get("/api/context", tags=["AI Context"], summary="Get the complete agent capability index")
def ai_context(request: Request):
    """
    AI-friendly context endpoint (inspired by ClawBridge).
    Returns a summary of available API capabilities for AI agents.
    """
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "description": "Kitchen Cupboard is a collaborative shopping list application.",
        "discovery": {
            "swagger": "/api/docs",
            "openapi": "/api/openapi.json",
            "agent_guide": "/api/agent-guide",
        },
        "authentication": {
            "header": "Authorization: Bearer <JWT or full kc_ API key>",
            "api_key_usage": "Send an API key directly to resource endpoints; do not call /api/auth/login with it.",
            "api_key_creation": "Sign in with a username and password, then use Settings > API Keys.",
            "scopes": {
                "read": "Permits resource GET operations.",
                "write": "Permits resource POST, PUT, and DELETE operations; keys with write also include read.",
            },
        },
        "capabilities": [
            "Create and manage multiple shopping lists",
            "Add, edit, check off, and remove items",
            "Categorize items (auto-remembers categories)",
            "Share lists with other users (editor/viewer roles)",
            "Real-time collaboration via WebSocket",
            "Item suggestions based on history",
            "Frequently used item favourites",
            "Recipe preview and ingredient import",
        ],
        "permissions": {
            "lists": "A key acts as its owner and can only see that user's owned or shared lists.",
            "roles": {
                "owner": "Full list access, including deletion and sharing.",
                "editor": "Can read and modify items and list details.",
                "viewer": "Read-only even when the API key has write scope.",
            },
        },
        "operations": _api_operations(request),
        "websocket": {
            "path": "/ws/{list_id}",
            "authentication": "Send {\"type\":\"auth\",\"token\":\"<JWT or API key>\"} as the first message.",
            "api_key_scope": "read",
        },
    }


@app.get(
    "/api/agent-guide",
    tags=["AI Context"],
    response_class=PlainTextResponse,
    summary="Read the plain-text API quick start for agents",
)
def agent_guide():
    return """# Kitchen Cupboard agent guide

Discovery
- OpenAPI: /api/openapi.json
- Interactive Swagger: /api/docs
- Machine-readable capability index: /api/context

Authentication
1. A user creates a key in Settings > API Keys and copies the full key when shown.
2. Send `Authorization: Bearer kc_...` directly to resource endpoints.
3. Do not send an API key to `/api/auth/login`; login accepts username/password and returns a JWT.
4. A key acts as its owner and only sees lists that user owns or has been invited to.

Scopes and roles
- `read` permits resource GET operations.
- `read,write` permits resource GET, POST, PUT, and DELETE operations.
- List roles still apply: viewers cannot mutate a list; editors can mutate items; only owners can share or delete a list.

Quick start
```
GET /api/lists
Authorization: Bearer kc_full_key

POST /api/lists/{list_id}/items
Authorization: Bearer kc_full_key
Content-Type: application/json

{"name":"Milk","quantity":2,"unit":"pints"}
```

Use the returned list and item IDs rather than guessing them. Successful creates return 201.
Authentication failures return 401, missing scope or list-role permission returns 403, inaccessible resources return 404, and invalid request data returns 422.
"""


def custom_openapi():
    """Add explicit agent authentication requirements and common errors to OpenAPI."""
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        tags=app.openapi_tags,
    )
    components = schema.setdefault("components", {})
    components.setdefault("schemas", {})["APIError"] = {
        "type": "object",
        "required": ["detail"],
        "properties": {
            "detail": {
                "description": "Human-readable error detail or structured validation errors.",
                "oneOf": [{"type": "string"}, {"type": "array", "items": {"type": "object"}}],
            }
        },
    }
    components.setdefault("responses", {}).update({
        "NotAuthenticated": {
            "description": "Missing, invalid, expired, disabled, or revoked credentials.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/APIError"}}},
        },
        "Forbidden": {
            "description": "The credential lacks the required scope, role, or admin permission.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/APIError"}}},
        },
        "NotFound": {
            "description": "The resource does not exist or is not visible to this user.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/APIError"}}},
        },
    })

    bearer = components.get("securitySchemes", {}).get("HTTPBearer")
    if bearer is not None:
        bearer["description"] = (
            "Bearer JWT from /api/auth/login, or a full kc_ API key sent directly to "
            "resource endpoints. API keys are never exchanged at /api/auth/login."
        )
        bearer["bearerFormat"] = "JWT or kc_ API key"

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        path_item = schema.get("paths", {}).get(route.path, {})
        auth = _route_auth(route)
        for method in (route.methods or set()) - {"HEAD", "OPTIONS"}:
            operation = path_item.get(method.lower())
            if operation is None:
                continue
            operation["x-kitchen-cupboard-auth"] = auth

            accepted = auth["accepted"]
            if accepted == ["public"]:
                auth_note = "Public; no authentication required."
            elif accepted == ["refresh_cookie"]:
                auth_note = "A valid HttpOnly refresh-token cookie is required."
            elif accepted == ["jwt"]:
                auth_note = "JWT login session required; API keys are not accepted."
                if auth.get("admin_required"):
                    auth_note += " The user must be an administrator."
            else:
                scope = auth["api_key_scope"]
                auth_note = f"Bearer JWT or API key with `{scope}` scope."

            existing = (operation.get("description") or "").rstrip()
            operation["description"] = f"{existing}\n\n**Authentication:** {auth_note}".strip()
            if accepted != ["public"]:
                operation.setdefault("responses", {})["401"] = {
                    "$ref": "#/components/responses/NotAuthenticated"
                }
            if accepted not in (["public"], ["refresh_cookie"]):
                operation["responses"]["403"] = {"$ref": "#/components/responses/Forbidden"}
            if "{list_id}" in route.path or "{item_id}" in route.path or "{category_id}" in route.path:
                operation.setdefault("responses", {})["404"] = {
                    "$ref": "#/components/responses/NotFound"
                }
            if route.name == "create_item":
                operation.setdefault("responses", {})["409"] = {
                    "description": "The client-provided item UUID is already used by another list.",
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/APIError"}}},
                }

    app.openapi_schema = schema
    return app.openapi_schema


app.openapi = custom_openapi


# ─── WebSocket ──────────────────────────────────────────────────────

@app.websocket("/ws/{list_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    list_id: str,
    token: str = Query(None),
):
    # Accept the connection first so the client can send auth as a message
    # instead of leaking the JWT in query-string logs.
    # Backwards-compatible: token-in-query-string still works.
    await websocket.accept()

    auth_token = token
    if not auth_token:
        try:
            first_msg = await websocket.receive_text()
        except Exception:
            await websocket.close(code=4001)
            return
        # Accept {"type": "auth", "token": "..."} or a bare token string
        try:
            parsed = json.loads(first_msg)
            auth_token = parsed.get("token") if isinstance(parsed, dict) else None
        except (json.JSONDecodeError, AttributeError):
            auth_token = first_msg

    if not auth_token:
        await websocket.close(code=4001)
        return

    # Verify list access
    db = next(get_db())
    try:
        principal = resolve_token(auth_token, db)
        if not principal:
            await websocket.close(code=4001)
            return
        if not api_key_has_scope(principal, "read"):
            await websocket.close(code=4003)
            return
        user_id = principal.user.id
        record_api_key_use(principal, db)

        user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
        if not user:
            await websocket.close(code=4001)
            return

        lst = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
        if not lst:
            await websocket.close(code=4004)
            return

        has_access = lst.owner_id == user_id or db.query(ListMember).filter(
            ListMember.list_id == list_id,
            ListMember.user_id == user_id,
        ).first() is not None

        if not has_access:
            await websocket.close(code=4003)
            return
    finally:
        db.close()

    await websocket.send_text(json.dumps({"type": "auth_ok"}))
    manager.active_connections[list_id].add(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, list_id)
    except Exception:
        manager.disconnect(websocket, list_id)


# ─── Serve Frontend (must be last) ─────────────────────────────────

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        # Resolve the path and ensure it stays within static_dir (prevent traversal)
        resolved = os.path.realpath(os.path.join(static_dir, full_path))
        static_real = os.path.realpath(static_dir)
        if resolved.startswith(static_real + os.sep) and os.path.isfile(resolved):
            return FileResponse(resolved)
        return FileResponse(os.path.join(static_dir, "index.html"))
