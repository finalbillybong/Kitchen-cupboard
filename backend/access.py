"""Shared list access-control helpers used by multiple routers."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import ShoppingList, ListMember


def check_list_access(
    list_id: str, user_id: str, db: Session, require_edit: bool = False
) -> ShoppingList:
    """Verify the user can access the list and optionally require edit permissions.

    Returns the ShoppingList if access is granted.
    Raises HTTPException(404) if the list doesn't exist or the user has no access,
    and HTTPException(403) if edit access is required but the user is a viewer.
    """
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
