import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import jwt
from jwt.exceptions import PyJWTError
from sqlalchemy.orm import Session

from config import settings
from database import engine, get_db, Base
from models import User, ListMember, ShoppingList
from seed import seed_categories
from websocket_manager import manager
from routers.auth_router import router as auth_router
from routers.categories_router import router as categories_router
from routers.lists_router import router as lists_router
from routers.items_router import router as items_router
from routers.items_router import suggestions_router
from routers.items_router import favourites_router

# Ensure data directory exists
os.makedirs("data", exist_ok=True)

# Create tables
Base.metadata.create_all(bind=engine)

# Seed default categories
db = next(get_db())
seed_categories(db)
db.close()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    # Swagger/OpenAPI docs require authentication via the UI;
    # disable the public JSON schema endpoint to avoid leaking API structure
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ─── CORS ───────────────────────────────────────────────────────────
# Restrict to same-origin only. The frontend is served from the same
# host, so no cross-origin requests are needed. API keys used by
# external tools (curl, Python) are not subject to CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],  # No cross-origin allowed by default
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# ─── Security headers ──────────────────────────────────────────────

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' wss: ws:; font-src 'self'"
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
    }


@app.get("/api/registration-status", tags=["Health"])
def registration_status():
    """Public endpoint for the frontend to check registration policy."""
    return {
        "open": settings.REGISTRATION_ENABLED,
        "invite_required": not settings.REGISTRATION_ENABLED,
    }


@app.get("/api/context", tags=["AI Context"])
def ai_context(db: Session = Depends(get_db)):
    """
    AI-friendly context endpoint (inspired by ClawBridge).
    Returns a summary of available API capabilities for AI agents.
    """
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "description": "Kitchen Cupboard is a collaborative shopping list application.",
        "authentication": {
            "type": "Bearer token",
            "methods": ["JWT (login)", "API key (kc_xxx)"],
            "header": "Authorization: Bearer <token>",
        },
        "capabilities": [
            "Create and manage multiple shopping lists",
            "Add, edit, check off, and remove items",
            "Categorize items (auto-remembers categories)",
            "Share lists with other users (editor/viewer roles)",
            "Real-time collaboration via WebSocket",
            "Item suggestions based on history",
        ],
        "endpoints": {
            "lists": {
                "GET /api/lists": "Get all lists for current user",
                "POST /api/lists": "Create a new list",
                "GET /api/lists/{id}": "Get list details",
                "PUT /api/lists/{id}": "Update a list",
                "DELETE /api/lists/{id}": "Delete a list (owner only)",
                "POST /api/lists/{id}/share": "Share list with another user",
            },
            "items": {
                "GET /api/lists/{id}/items": "Get all items in a list",
                "POST /api/lists/{id}/items": "Add item to list",
                "PUT /api/lists/{id}/items/{item_id}": "Update an item",
                "DELETE /api/lists/{id}/items/{item_id}": "Remove an item",
                "POST /api/lists/{id}/items/clear-checked": "Clear checked items",
            },
            "categories": {
                "GET /api/categories": "List all categories",
                "POST /api/categories": "Create custom category",
                "PUT /api/categories/{id}": "Update a category",
                "DELETE /api/categories/{id}": "Delete custom category",
            },
            "suggestions": {
                "GET /api/suggestions?q=": "Get item suggestions by name prefix",
            },
            "websocket": {
                "WS /ws/{list_id}?token=": "Real-time updates for a list",
            },
        },
    }


# ─── WebSocket ──────────────────────────────────────────────────────

@app.websocket("/ws/{list_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    list_id: str,
    token: str = Query(...),
):
    # Authenticate
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001)
            return
    except PyJWTError:
        await websocket.close(code=4001)
        return

    # Verify list access
    db = next(get_db())
    try:
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

    await manager.connect(websocket, list_id)
    try:
        while True:
            # Keep connection alive; client sends pings
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

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Resolve the path and ensure it stays within static_dir (prevent traversal)
        resolved = os.path.realpath(os.path.join(static_dir, full_path))
        static_real = os.path.realpath(static_dir)
        if resolved.startswith(static_real + os.sep) and os.path.isfile(resolved):
            return FileResponse(resolved)
        return FileResponse(os.path.join(static_dir, "index.html"))
