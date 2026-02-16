from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, ShoppingList, ListMember, ListItem
from schemas import (
    ListCreate,
    ListUpdate,
    ListOut,
    ListMemberOut,
    ListShareCreate,
)

router = APIRouter(prefix="/api/lists", tags=["Shopping Lists"])


def _get_user_lists(user_id: str, db: Session, include_archived: bool = False):
    """Get all lists the user owns or is a member of."""
    owned_ids = db.query(ShoppingList.id).filter(ShoppingList.owner_id == user_id)
    member_ids = db.query(ListMember.list_id).filter(ListMember.user_id == user_id)
    all_ids = owned_ids.union(member_ids).subquery()

    query = db.query(ShoppingList).filter(ShoppingList.id.in_(
        db.query(all_ids.c[0])
    ))
    if not include_archived:
        query = query.filter(ShoppingList.is_archived == False)
    return query.order_by(ShoppingList.updated_at.desc()).all()


def _list_to_out(lst: ShoppingList, db: Session) -> ListOut:
    items = db.query(ListItem).filter(ListItem.list_id == lst.id).all()
    members = db.query(ListMember).filter(ListMember.list_id == lst.id).all()

    member_list = []
    for m in members:
        u = db.query(User).filter(User.id == m.user_id).first()
        if u:
            member_list.append(ListMemberOut(
                id=m.id,
                user_id=m.user_id,
                username=u.username,
                display_name=u.display_name,
                role=m.role,
                joined_at=m.joined_at,
            ))

    # Add owner as member
    owner = db.query(User).filter(User.id == lst.owner_id).first()
    if owner and not any(m.user_id == owner.id for m in members):
        member_list.insert(0, ListMemberOut(
            id="owner",
            user_id=owner.id,
            username=owner.username,
            display_name=owner.display_name,
            role="owner",
            joined_at=lst.created_at,
        ))

    return ListOut(
        id=lst.id,
        name=lst.name,
        description=lst.description,
        owner_id=lst.owner_id,
        color=lst.color,
        icon=lst.icon,
        is_archived=lst.is_archived,
        created_at=lst.created_at,
        updated_at=lst.updated_at,
        item_count=len(items),
        checked_count=len([i for i in items if i.checked]),
        members=member_list,
    )


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


@router.get("", response_model=list[ListOut])
def get_lists(
    include_archived: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lists = _get_user_lists(user.id, db, include_archived)
    return [_list_to_out(lst, db) for lst in lists]


@router.post("", response_model=ListOut, status_code=201)
def create_list(
    data: ListCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lst = ShoppingList(
        name=data.name,
        description=data.description,
        owner_id=user.id,
        color=data.color,
        icon=data.icon,
    )
    db.add(lst)
    db.commit()
    db.refresh(lst)
    return _list_to_out(lst, db)


@router.get("/{list_id}", response_model=ListOut)
def get_list(
    list_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lst = _check_list_access(list_id, user.id, db)
    return _list_to_out(lst, db)


@router.put("/{list_id}", response_model=ListOut)
def update_list(
    list_id: str,
    data: ListUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lst = _check_list_access(list_id, user.id, db, require_edit=True)

    if data.name is not None:
        lst.name = data.name
    if data.description is not None:
        lst.description = data.description
    if data.color is not None:
        lst.color = data.color
    if data.icon is not None:
        lst.icon = data.icon
    if data.is_archived is not None:
        lst.is_archived = data.is_archived

    db.commit()
    db.refresh(lst)
    return _list_to_out(lst, db)


@router.delete("/{list_id}", status_code=204)
def delete_list(
    list_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lst = db.query(ShoppingList).filter(
        ShoppingList.id == list_id, ShoppingList.owner_id == user.id
    ).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found or not owner")
    db.delete(lst)
    db.commit()


# ─── Sharing ────────────────────────────────────────────────────────

@router.post("/{list_id}/share", response_model=ListMemberOut, status_code=201)
def share_list(
    list_id: str,
    data: ListShareCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lst = db.query(ShoppingList).filter(
        ShoppingList.id == list_id, ShoppingList.owner_id == user.id
    ).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found or not owner")

    target = db.query(User).filter(User.username == data.username).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot share with yourself")

    existing = db.query(ListMember).filter(
        ListMember.list_id == list_id, ListMember.user_id == target.id
    ).first()
    if existing:
        existing.role = data.role
        db.commit()
        db.refresh(existing)
        return ListMemberOut(
            id=existing.id,
            user_id=target.id,
            username=target.username,
            display_name=target.display_name,
            role=existing.role,
            joined_at=existing.joined_at,
        )

    member = ListMember(
        list_id=list_id,
        user_id=target.id,
        role=data.role,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return ListMemberOut(
        id=member.id,
        user_id=target.id,
        username=target.username,
        display_name=target.display_name,
        role=member.role,
        joined_at=member.joined_at,
    )


@router.delete("/{list_id}/share/{user_id}", status_code=204)
def unshare_list(
    list_id: str,
    user_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lst = db.query(ShoppingList).filter(
        ShoppingList.id == list_id, ShoppingList.owner_id == user.id
    ).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found or not owner")

    member = db.query(ListMember).filter(
        ListMember.list_id == list_id, ListMember.user_id == user_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(member)
    db.commit()
