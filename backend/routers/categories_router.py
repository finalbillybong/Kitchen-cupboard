from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, Category
from schemas import CategoryCreate, CategoryUpdate, CategoryOut

router = APIRouter(prefix="/api/categories", tags=["Categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cats = db.query(Category).order_by(Category.sort_order, Category.name).all()
    return [CategoryOut.model_validate(c) for c in cats]


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(
    data: CategoryCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(Category).filter(Category.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")

    cat = Category(
        name=data.name,
        icon=data.icon,
        color=data.color,
        sort_order=data.sort_order,
        created_by=user.id,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return CategoryOut.model_validate(cat)


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: str,
    data: CategoryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if cat.is_default:
        raise HTTPException(status_code=403, detail="Cannot modify default categories")
    if cat.created_by and cat.created_by != user.id:
        raise HTTPException(status_code=403, detail="Can only modify your own categories")

    if data.name is not None:
        cat.name = data.name
    if data.icon is not None:
        cat.icon = data.icon
    if data.color is not None:
        cat.color = data.color
    if data.sort_order is not None:
        cat.sort_order = data.sort_order

    db.commit()
    db.refresh(cat)
    return CategoryOut.model_validate(cat)


@router.delete("/{category_id}", status_code=204)
def delete_category(
    category_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if cat.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete default categories")
    if cat.created_by and cat.created_by != user.id:
        raise HTTPException(status_code=403, detail="Can only delete your own categories")
    db.delete(cat)
    db.commit()
