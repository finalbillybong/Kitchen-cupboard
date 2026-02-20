from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from access import check_list_access
from auth import get_current_user
from database import get_db
from models import User, ShoppingList, ListItem, Category, ItemCategoryMemory, utcnow
from schemas import (
    ItemCreate, ItemUpdate, ItemOut, ItemSuggestion, ItemReorderRequest,
    RecipeImportRequest, RecipeImportPreview, RecipeImportResult,
)
from recipe_parser import fetch_recipe
from push_service import send_push_for_list_event
from websocket_manager import manager

router = APIRouter(prefix="/api/lists/{list_id}/items", tags=["List Items"])


def _item_to_out(item: ListItem) -> ItemOut:
    """Convert a ListItem (with relationships loaded) to its API representation."""
    cat = item.category
    added_user = item.added_by_user
    return ItemOut(
        id=item.id,
        list_id=item.list_id,
        name=item.name,
        quantity=item.quantity,
        unit=item.unit,
        category_id=item.category_id,
        category_name=cat.name if cat else None,
        category_color=cat.color if cat else None,
        category_icon=cat.icon if cat else None,
        checked=item.checked,
        checked_by=item.checked_by,
        checked_at=item.checked_at,
        added_by=item.added_by,
        added_by_name=added_user.display_name if added_user else None,
        notes=item.notes,
        sort_order=item.sort_order,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _load_item(item_id: str, list_id: str, db: Session) -> ListItem:
    """Load a single item with its relationships eagerly loaded."""
    return (
        db.query(ListItem)
        .options(joinedload(ListItem.category), joinedload(ListItem.added_by_user))
        .filter(ListItem.id == item_id, ListItem.list_id == list_id)
        .first()
    )


def _update_category_memory(item_name: str, category_id: str, db: Session):
    """Remember the category assignment for future suggestions."""
    name_lower = item_name.strip().lower()
    memory = db.query(ItemCategoryMemory).filter(
        ItemCategoryMemory.item_name_lower == name_lower,
        ItemCategoryMemory.category_id == category_id,
    ).first()
    if memory:
        memory.usage_count += 1
        memory.last_used = utcnow()
    else:
        db.add(ItemCategoryMemory(
            item_name_lower=name_lower,
            category_id=category_id,
        ))


def _lookup_category(item_name: str, db: Session) -> str | None:
    """Find the most-used category_id for a given item name, or None."""
    memory = db.query(ItemCategoryMemory).filter(
        ItemCategoryMemory.item_name_lower == item_name.strip().lower()
    ).order_by(ItemCategoryMemory.usage_count.desc()).first()
    return memory.category_id if memory else None


async def _broadcast(list_id: str, msg_type: str, data: dict, user: User, db: Session | None = None):
    """Send a WebSocket broadcast and push notifications to list subscribers."""
    await manager.broadcast_to_list(list_id, {
        "type": msg_type,
        "list_id": list_id,
        "data": data,
        "user_id": user.id,
        "username": user.display_name or user.username,
    })
    if db is not None:
        send_push_for_list_event(list_id, msg_type, data, user, db)


def _touch_list(list_id: str, db: Session):
    """Update the list's updated_at timestamp."""
    db.query(ShoppingList).filter(ShoppingList.id == list_id).update(
        {ShoppingList.updated_at: utcnow()}, synchronize_session=False
    )


# ─── Endpoints ─────────────────────────────────────────────────────

@router.get("", response_model=list[ItemOut])
def get_items(
    list_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_list_access(list_id, user.id, db)
    items = (
        db.query(ListItem)
        .options(joinedload(ListItem.category), joinedload(ListItem.added_by_user))
        .filter(ListItem.list_id == list_id)
        .order_by(ListItem.checked, ListItem.sort_order, ListItem.created_at)
        .all()
    )
    return [_item_to_out(item) for item in items]


@router.post("", response_model=ItemOut, status_code=201)
async def create_item(
    list_id: str,
    data: ItemCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_list_access(list_id, user.id, db, require_edit=True)

    category_id = data.category_id or _lookup_category(data.name, db)

    item = ListItem(
        list_id=list_id,
        name=data.name,
        quantity=data.quantity,
        unit=data.unit,
        category_id=category_id,
        added_by=user.id,
        notes=data.notes,
        sort_order=data.sort_order,
    )
    db.add(item)

    if category_id:
        _update_category_memory(data.name, category_id, db)

    _touch_list(list_id, db)
    db.commit()

    item = _load_item(item.id, list_id, db)
    result = _item_to_out(item)
    await _broadcast(list_id, "item_added", result.model_dump(mode="json"), user, db)
    return result


@router.post("/reorder", status_code=200)
async def reorder_items(
    list_id: str,
    data: ItemReorderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Batch-update sort_order for items based on their position in the list."""
    check_list_access(list_id, user.id, db, require_edit=True)

    for index, item_id in enumerate(data.item_ids):
        db.query(ListItem).filter(
            ListItem.id == item_id, ListItem.list_id == list_id
        ).update({ListItem.sort_order: index}, synchronize_session=False)

    db.commit()
    await _broadcast(list_id, "items_reordered", {"item_ids": data.item_ids}, user)
    return {"ok": True}


@router.put("/{item_id}", response_model=ItemOut)
async def update_item(
    list_id: str,
    item_id: str,
    data: ItemUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_list_access(list_id, user.id, db, require_edit=True)
    item = db.query(ListItem).filter(
        ListItem.id == item_id, ListItem.list_id == list_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if data.name is not None:
        item.name = data.name
    if data.quantity is not None:
        item.quantity = data.quantity
    if data.unit is not None:
        item.unit = data.unit
    if data.category_id is not None:
        item.category_id = data.category_id
        _update_category_memory(item.name, data.category_id, db)
    if data.checked is not None:
        item.checked = data.checked
        if data.checked:
            item.checked_by = user.id
            item.checked_at = utcnow()
        else:
            item.checked_by = None
            item.checked_at = None
    if data.notes is not None:
        item.notes = data.notes
    if data.sort_order is not None:
        item.sort_order = data.sort_order

    _touch_list(list_id, db)
    db.commit()

    item = _load_item(item_id, list_id, db)
    result = _item_to_out(item)

    msg_type = "item_checked" if data.checked is not None else "item_updated"
    await _broadcast(list_id, msg_type, result.model_dump(mode="json"), user, db)
    return result


@router.delete("/{item_id}", status_code=204)
async def delete_item(
    list_id: str,
    item_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_list_access(list_id, user.id, db, require_edit=True)
    item = db.query(ListItem).filter(
        ListItem.id == item_id, ListItem.list_id == list_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    db.delete(item)
    _touch_list(list_id, db)
    db.commit()

    await _broadcast(list_id, "item_removed", {"id": item_id}, user, db)


@router.post("/clear-checked", status_code=200)
async def clear_checked_items(
    list_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_list_access(list_id, user.id, db, require_edit=True)
    deleted = db.query(ListItem).filter(
        ListItem.list_id == list_id, ListItem.checked == True
    ).delete(synchronize_session=False)
    db.commit()

    await _broadcast(list_id, "checked_cleared", {"deleted_count": deleted}, user, db)
    return {"deleted_count": deleted}


# ─── Recipe Import ─────────────────────────────────────────────────

async def _fetch_recipe_or_raise(url: str) -> dict:
    """Fetch and parse a recipe, converting errors to HTTP 422."""
    try:
        return await fetch_recipe(url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        raise HTTPException(status_code=422, detail="Failed to fetch or parse the recipe URL.")


@router.post("/import-recipe/preview", response_model=RecipeImportPreview)
async def preview_recipe_import(
    list_id: str,
    data: RecipeImportRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch a recipe URL and return parsed ingredients for preview before importing."""
    check_list_access(list_id, user.id, db, require_edit=True)
    recipe = await _fetch_recipe_or_raise(data.url)
    return RecipeImportPreview(**recipe)


@router.post("/import-recipe", response_model=RecipeImportResult, status_code=201)
async def import_recipe(
    list_id: str,
    data: RecipeImportRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch a recipe URL, parse ingredients, and add them all to the list."""
    check_list_access(list_id, user.id, db, require_edit=True)
    recipe = await _fetch_recipe_or_raise(data.url)

    max_sort = db.query(func.max(ListItem.sort_order)).filter(
        ListItem.list_id == list_id
    ).scalar() or 0

    added_items = []
    for i, ing in enumerate(recipe["ingredients"]):
        category_id = _lookup_category(ing["name"], db)
        item = ListItem(
            list_id=list_id,
            name=ing["name"],
            quantity=ing["quantity"],
            unit=ing["unit"],
            category_id=category_id,
            added_by=user.id,
            notes=f"From recipe: {recipe['title']}",
            sort_order=max_sort + i + 1,
        )
        db.add(item)
        added_items.append(item)

    _touch_list(list_id, db)
    db.commit()

    result_items = []
    for item in added_items:
        loaded = _load_item(item.id, list_id, db)
        result_items.append(_item_to_out(loaded))

    for result in result_items:
        await _broadcast(list_id, "item_added", result.model_dump(mode="json"), user, db)

    return RecipeImportResult(
        title=recipe["title"],
        source=recipe["source"],
        added_count=len(result_items),
        items=result_items,
    )


# ─── Item Suggestions ─────────────────────────────────────────────

suggestions_router = APIRouter(prefix="/api/suggestions", tags=["Suggestions"])


def _memories_to_suggestions(memories: list[ItemCategoryMemory], limit: int | None = None) -> list[ItemSuggestion]:
    """De-duplicate memories by item name and build suggestion responses."""
    results = []
    seen = set()
    for m in memories:
        if m.item_name_lower in seen:
            continue
        seen.add(m.item_name_lower)
        cat = m.category
        results.append(ItemSuggestion(
            name=m.item_name_lower.title(),
            category_id=m.category_id,
            category_name=cat.name if cat else None,
            usage_count=m.usage_count,
        ))
        if limit and len(results) >= limit:
            break
    return results


@suggestions_router.get("", response_model=list[ItemSuggestion])
def get_suggestions(
    q: str = "",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get item suggestions based on previously used items."""
    if len(q) < 1:
        return []

    safe_q = q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    memories = (
        db.query(ItemCategoryMemory)
        .options(joinedload(ItemCategoryMemory.category))
        .filter(ItemCategoryMemory.item_name_lower.like(f"%{safe_q}%", escape="\\"))
        .order_by(ItemCategoryMemory.usage_count.desc())
        .limit(10)
        .all()
    )
    return _memories_to_suggestions(memories)


# ─── Favourites ────────────────────────────────────────────────────

favourites_router = APIRouter(prefix="/api/favourites", tags=["Favourites"])


@favourites_router.get("", response_model=list[ItemSuggestion])
def get_favourites(
    limit: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get most frequently used items across all lists."""
    memories = (
        db.query(ItemCategoryMemory)
        .options(joinedload(ItemCategoryMemory.category))
        .order_by(ItemCategoryMemory.usage_count.desc())
        .limit(limit * 2)
        .all()
    )
    return _memories_to_suggestions(memories, limit=limit)
