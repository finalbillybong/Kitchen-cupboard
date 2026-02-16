from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from auth import get_current_user
from database import get_db
from models import User, ShoppingList, ListMember, ListItem, Category, ItemCategoryMemory
from schemas import ItemCreate, ItemUpdate, ItemOut, ItemSuggestion
from websocket_manager import manager

router = APIRouter(prefix="/api/lists/{list_id}/items", tags=["List Items"])


def _check_list_access(list_id: str, user_id: str, db: Session, require_edit: bool = False) -> ShoppingList:
    lst = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")

    if lst.owner_id == user_id:
        return lst

    member = db.query(ListMember).filter(
        ListMember.list_id == list_id,
        ListMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="List not found")

    if require_edit and member.role == "viewer":
        raise HTTPException(status_code=403, detail="View-only access")

    return lst


def _item_to_out(item: ListItem, db: Session) -> ItemOut:
    cat_name = None
    cat_color = None
    cat_icon = None
    if item.category_id:
        cat = db.query(Category).filter(Category.id == item.category_id).first()
        if cat:
            cat_name = cat.name
            cat_color = cat.color
            cat_icon = cat.icon

    added_by_user = db.query(User).filter(User.id == item.added_by).first()

    return ItemOut(
        id=item.id,
        list_id=item.list_id,
        name=item.name,
        quantity=item.quantity,
        unit=item.unit,
        category_id=item.category_id,
        category_name=cat_name,
        category_color=cat_color,
        category_icon=cat_icon,
        checked=item.checked,
        checked_by=item.checked_by,
        checked_at=item.checked_at,
        added_by=item.added_by,
        added_by_name=added_by_user.display_name if added_by_user else None,
        notes=item.notes,
        sort_order=item.sort_order,
        created_at=item.created_at,
        updated_at=item.updated_at,
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
        memory.last_used = datetime.now(timezone.utc)
    else:
        memory = ItemCategoryMemory(
            item_name_lower=name_lower,
            category_id=category_id,
        )
        db.add(memory)


@router.get("", response_model=list[ItemOut])
def get_items(
    list_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_list_access(list_id, user.id, db)
    items = db.query(ListItem).filter(ListItem.list_id == list_id).order_by(
        ListItem.checked, ListItem.sort_order, ListItem.created_at
    ).all()
    return [_item_to_out(item, db) for item in items]


@router.post("", response_model=ItemOut, status_code=201)
async def create_item(
    list_id: str,
    data: ItemCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_list_access(list_id, user.id, db, require_edit=True)

    # Auto-suggest category if none provided
    category_id = data.category_id
    if not category_id:
        memory = db.query(ItemCategoryMemory).filter(
            ItemCategoryMemory.item_name_lower == data.name.strip().lower()
        ).order_by(ItemCategoryMemory.usage_count.desc()).first()
        if memory:
            category_id = memory.category_id

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

    # Update category memory
    if category_id:
        _update_category_memory(data.name, category_id, db)

    # Update list timestamp
    lst = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if lst:
        lst.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(item)

    result = _item_to_out(item, db)

    # Notify WebSocket subscribers
    await manager.broadcast_to_list(list_id, {
        "type": "item_added",
        "list_id": list_id,
        "data": result.model_dump(mode="json"),
        "user_id": user.id,
        "username": user.display_name or user.username,
    })

    return result


@router.put("/{item_id}", response_model=ItemOut)
async def update_item(
    list_id: str,
    item_id: str,
    data: ItemUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_list_access(list_id, user.id, db, require_edit=True)
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
            item.checked_at = datetime.now(timezone.utc)
        else:
            item.checked_by = None
            item.checked_at = None
    if data.notes is not None:
        item.notes = data.notes
    if data.sort_order is not None:
        item.sort_order = data.sort_order

    item.updated_at = datetime.now(timezone.utc)

    # Update list timestamp
    lst = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if lst:
        lst.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(item)

    result = _item_to_out(item, db)

    msg_type = "item_checked" if data.checked is not None else "item_updated"
    await manager.broadcast_to_list(list_id, {
        "type": msg_type,
        "list_id": list_id,
        "data": result.model_dump(mode="json"),
        "user_id": user.id,
        "username": user.display_name or user.username,
    })

    return result


@router.delete("/{item_id}", status_code=204)
async def delete_item(
    list_id: str,
    item_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_list_access(list_id, user.id, db, require_edit=True)
    item = db.query(ListItem).filter(
        ListItem.id == item_id, ListItem.list_id == list_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item_data = _item_to_out(item, db)
    db.delete(item)

    lst = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if lst:
        lst.updated_at = datetime.now(timezone.utc)

    db.commit()

    await manager.broadcast_to_list(list_id, {
        "type": "item_removed",
        "list_id": list_id,
        "data": {"id": item_id},
        "user_id": user.id,
        "username": user.display_name or user.username,
    })


@router.post("/clear-checked", status_code=200)
async def clear_checked_items(
    list_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_list_access(list_id, user.id, db, require_edit=True)
    deleted = db.query(ListItem).filter(
        ListItem.list_id == list_id, ListItem.checked == True
    ).delete()
    db.commit()

    await manager.broadcast_to_list(list_id, {
        "type": "checked_cleared",
        "list_id": list_id,
        "data": {"deleted_count": deleted},
        "user_id": user.id,
        "username": user.display_name or user.username,
    })

    return {"deleted_count": deleted}


# ─── Item Suggestions (global endpoint) ────────────────────────────

suggestions_router = APIRouter(prefix="/api/suggestions", tags=["Suggestions"])


@suggestions_router.get("", response_model=list[ItemSuggestion])
def get_suggestions(
    q: str = "",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get item suggestions based on previously used items."""
    if len(q) < 1:
        return []

    memories = db.query(ItemCategoryMemory).filter(
        ItemCategoryMemory.item_name_lower.like(f"%{q.lower()}%")
    ).order_by(ItemCategoryMemory.usage_count.desc()).limit(10).all()

    results = []
    seen_names = set()
    for m in memories:
        if m.item_name_lower in seen_names:
            continue
        seen_names.add(m.item_name_lower)
        cat = db.query(Category).filter(Category.id == m.category_id).first()
        results.append(ItemSuggestion(
            name=m.item_name_lower.title(),
            category_id=m.category_id,
            category_name=cat.name if cat else None,
            usage_count=m.usage_count,
        ))

    return results
