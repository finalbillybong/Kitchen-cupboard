from .auth_router import router as auth_router
from .categories_router import router as categories_router
from .lists_router import router as lists_router
from .items_router import router as items_router, suggestions_router, favourites_router

__all__ = [
    "auth_router",
    "categories_router",
    "lists_router",
    "items_router",
    "suggestions_router",
    "favourites_router",
]
