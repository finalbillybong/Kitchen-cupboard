"""Authenticated global ingredient, meal, and Basics library endpoints."""

import hashlib
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from access import check_list_access
from auth import get_current_admin_jwt, get_current_user_read, get_current_user_write
from database import get_db
from models import (
    AuditLog,
    BasicsCollection,
    BasicsItem,
    BulkAddReceipt,
    Category,
    Ingredient,
    ItemCategoryMemory,
    ListItem,
    Meal,
    MealIngredient,
    ShoppingList,
    User,
    utcnow,
)
from recipe_parser import fetch_recipe
from schemas import (
    ArchiveRequest,
    BasicsItemCreate,
    BasicsItemOut,
    BasicsItemUpdate,
    BasicsOut,
    BasicsReorderRequest,
    IngredientCreate,
    IngredientOut,
    IngredientUpdate,
    LibraryCommitOut,
    LibraryCommitRequest,
    LibraryPreviewOut,
    LibraryPreviewRequest,
    LibraryPreviewRow,
    MealCreate,
    MealIngredientInput,
    MealIngredientOut,
    MealOut,
    MealUpdate,
    RecipeImportPreview,
    RecipeMealCreateRequest,
)
from websocket_manager import manager


ingredients_router = APIRouter(prefix="/api/ingredients", tags=["Ingredients"])
meals_router = APIRouter(prefix="/api/meals", tags=["Meals"])
basics_router = APIRouter(prefix="/api/basics", tags=["Basics"])


def normalize_name(value: str) -> str:
    """Normalize catalogue/list names for de-duplication and smart merging."""
    return " ".join(value.strip().split()).casefold()


def normalize_unit(value: str | None) -> str:
    return " ".join((value or "").strip().split()).casefold()


def display_name(user: User | None) -> str | None:
    return (user.display_name or user.username) if user else None


def audit(db: Session, user: User, action: str, detail: dict) -> None:
    db.add(AuditLog(user_id=user.id, action=action, detail=json.dumps(detail, sort_keys=True)))


def validate_category(category_id: str | None, db: Session) -> None:
    if category_id and not db.query(Category.id).filter(Category.id == category_id).first():
        raise HTTPException(status_code=422, detail="Category not found")


def version_conflict(resource: str, current: int) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail=f"{resource} was changed by another user (current version: {current})",
    )


def requested_version(data: ArchiveRequest | None, query_version: int | None) -> int:
    version = data.expected_version if data else query_version
    if version is None:
        raise HTTPException(status_code=422, detail="expected_version is required")
    return version


def require_archive_permission(created_by: str, user: User) -> None:
    if created_by != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only the creator or an administrator can archive this record")


def require_admin_archived_view(include_archived: bool, user: User) -> None:
    if include_archived and (not user.is_admin or getattr(user, "_auth_method", None) != "jwt"):
        raise HTTPException(status_code=403, detail="Administrator login required for archived records")


def ensure_basics(db: Session) -> BasicsCollection:
    collection = db.query(BasicsCollection).filter(BasicsCollection.id == "global").first()
    if not collection:
        collection = BasicsCollection(id="global", name="Basics")
        db.add(collection)
        db.flush()
    return collection


def ingredient_out(ingredient: Ingredient) -> IngredientOut:
    return IngredientOut(
        id=ingredient.id,
        name=ingredient.name,
        normalized_name=ingredient.normalized_name,
        default_unit=ingredient.default_unit,
        default_category_id=ingredient.default_category_id,
        default_category_name=ingredient.default_category.name if ingredient.default_category else None,
        version=ingredient.version,
        is_archived=ingredient.is_archived,
        created_by=ingredient.created_by,
        created_by_name=display_name(ingredient.creator),
        updated_by=ingredient.updated_by,
        updated_by_name=display_name(ingredient.updater),
        created_at=ingredient.created_at,
        updated_at=ingredient.updated_at,
    )


def meal_row_out(row: MealIngredient) -> MealIngredientOut:
    return MealIngredientOut(
        id=row.id,
        ingredient_id=row.ingredient_id,
        name=row.ingredient.name,
        ingredient_archived=row.ingredient.is_archived,
        quantity=row.quantity,
        unit=row.unit,
        category_id=row.category_id,
        category_name=row.category.name if row.category else None,
        notes=row.notes,
        scales_with_servings=row.scales_with_servings,
        sort_order=row.sort_order,
    )


def meal_out(meal: Meal) -> MealOut:
    return MealOut(
        id=meal.id,
        name=meal.name,
        description=meal.description,
        base_servings=meal.base_servings,
        source_url=meal.source_url,
        version=meal.version,
        is_archived=meal.is_archived,
        created_by=meal.created_by,
        created_by_name=display_name(meal.creator),
        updated_by=meal.updated_by,
        updated_by_name=display_name(meal.updater),
        created_at=meal.created_at,
        updated_at=meal.updated_at,
        ingredients=[meal_row_out(row) for row in sorted(meal.ingredients, key=lambda item: item.sort_order)],
    )


def basics_item_out(row: BasicsItem) -> BasicsItemOut:
    return BasicsItemOut(
        id=row.id,
        ingredient_id=row.ingredient_id,
        name=row.ingredient.name,
        ingredient_archived=row.ingredient.is_archived,
        quantity=row.quantity,
        unit=row.unit,
        category_id=row.category_id,
        category_name=row.category.name if row.category else None,
        notes=row.notes,
        scales_with_servings=row.scales_with_servings,
        sort_order=row.sort_order,
        version=row.version,
        is_archived=row.is_archived,
        created_by=row.created_by,
        created_by_name=display_name(row.creator),
        updated_by=row.updated_by,
        updated_by_name=display_name(row.updater),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def basics_out(collection: BasicsCollection, include_archived: bool = False) -> BasicsOut:
    rows = sorted(collection.items, key=lambda item: item.sort_order)
    if not include_archived:
        rows = [row for row in rows if not row.is_archived]
    return BasicsOut(
        id=collection.id,
        name=collection.name,
        version=collection.version,
        updated_by=collection.updated_by,
        updated_by_name=display_name(collection.updater),
        created_at=collection.created_at,
        updated_at=collection.updated_at,
        items=[basics_item_out(row) for row in rows],
    )


def get_ingredient(ingredient_id: str, db: Session) -> Ingredient:
    ingredient = (
        db.query(Ingredient)
        .options(
            joinedload(Ingredient.default_category),
            joinedload(Ingredient.creator),
            joinedload(Ingredient.updater),
        )
        .filter(Ingredient.id == ingredient_id)
        .first()
    )
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    return ingredient


def get_meal(meal_id: str, db: Session) -> Meal:
    meal = (
        db.query(Meal)
        .options(
            joinedload(Meal.creator),
            joinedload(Meal.updater),
            joinedload(Meal.ingredients).joinedload(MealIngredient.ingredient),
            joinedload(Meal.ingredients).joinedload(MealIngredient.category),
        )
        .filter(Meal.id == meal_id)
        .first()
    )
    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")
    return meal


def get_basics(db: Session) -> BasicsCollection:
    collection = (
        db.query(BasicsCollection)
        .options(
            joinedload(BasicsCollection.updater),
            joinedload(BasicsCollection.items).joinedload(BasicsItem.ingredient),
            joinedload(BasicsCollection.items).joinedload(BasicsItem.category),
            joinedload(BasicsCollection.items).joinedload(BasicsItem.creator),
            joinedload(BasicsCollection.items).joinedload(BasicsItem.updater),
        )
        .filter(BasicsCollection.id == "global")
        .first()
    )
    if not collection:
        collection = ensure_basics(db)
        db.commit()
        return get_basics(db)
    return collection


# ─── Ingredients ──────────────────────────────────────────────────────


@ingredients_router.get("", response_model=list[IngredientOut], summary="List global ingredients")
def list_ingredients(
    q: str = "",
    include_archived: bool = False,
    user: User = Depends(get_current_user_read),
    db: Session = Depends(get_db),
):
    require_admin_archived_view(include_archived, user)
    query = db.query(Ingredient).options(
        joinedload(Ingredient.default_category),
        joinedload(Ingredient.creator),
        joinedload(Ingredient.updater),
    )
    if not include_archived:
        query = query.filter(Ingredient.is_archived == False)
    if q.strip():
        escaped = normalize_name(q).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(Ingredient.normalized_name.like(f"%{escaped}%", escape="\\"))
    return [ingredient_out(item) for item in query.order_by(Ingredient.normalized_name).all()]


@ingredients_router.post("", response_model=IngredientOut, status_code=201, summary="Create a global ingredient")
def create_ingredient(
    data: IngredientCreate,
    user: User = Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    validate_category(data.default_category_id, db)
    normalized = normalize_name(data.name)
    existing = db.query(Ingredient).filter(Ingredient.normalized_name == normalized).first()
    if existing:
        raise HTTPException(status_code=409, detail="An ingredient with this name already exists")
    ingredient = Ingredient(
        name=" ".join(data.name.strip().split()),
        normalized_name=normalized,
        default_unit=data.default_unit.strip(),
        default_category_id=data.default_category_id,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(ingredient)
    db.flush()
    audit(db, user, "ingredient.create", {"ingredient_id": ingredient.id, "name": ingredient.name})
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An ingredient with this name already exists")
    return ingredient_out(get_ingredient(ingredient.id, db))


@ingredients_router.get("/{ingredient_id}", response_model=IngredientOut, summary="Get a global ingredient")
def read_ingredient(
    ingredient_id: str,
    user: User = Depends(get_current_user_read),
    db: Session = Depends(get_db),
):
    ingredient = get_ingredient(ingredient_id, db)
    if ingredient.is_archived and (
        not user.is_admin or getattr(user, "_auth_method", None) != "jwt"
    ):
        raise HTTPException(status_code=404, detail="Ingredient not found")
    return ingredient_out(ingredient)


@ingredients_router.put("/{ingredient_id}", response_model=IngredientOut, summary="Update a global ingredient")
def update_ingredient(
    ingredient_id: str,
    data: IngredientUpdate,
    user: User = Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    ingredient = get_ingredient(ingredient_id, db)
    if ingredient.is_archived:
        raise HTTPException(status_code=409, detail="Archived ingredients cannot be edited")
    if ingredient.version != data.expected_version:
        raise version_conflict("Ingredient", ingredient.version)
    if data.name is not None:
        normalized = normalize_name(data.name)
        duplicate = db.query(Ingredient.id).filter(
            Ingredient.normalized_name == normalized, Ingredient.id != ingredient.id
        ).first()
        if duplicate:
            raise HTTPException(status_code=409, detail="An ingredient with this name already exists")
        ingredient.name = " ".join(data.name.strip().split())
        ingredient.normalized_name = normalized
    if data.default_unit is not None:
        ingredient.default_unit = data.default_unit.strip()
    if "default_category_id" in data.model_fields_set:
        validate_category(data.default_category_id, db)
        ingredient.default_category_id = data.default_category_id
    ingredient.version += 1
    ingredient.updated_by = user.id
    ingredient.updated_at = utcnow()
    audit(db, user, "ingredient.update", {"ingredient_id": ingredient.id, "version": ingredient.version})
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An ingredient with this name already exists")
    return ingredient_out(get_ingredient(ingredient.id, db))


@ingredients_router.delete("/{ingredient_id}", response_model=IngredientOut, summary="Archive a global ingredient")
def archive_ingredient(
    ingredient_id: str,
    data: ArchiveRequest | None = None,
    expected_version: int | None = Query(None, ge=1),
    user: User = Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    ingredient = get_ingredient(ingredient_id, db)
    require_archive_permission(ingredient.created_by, user)
    if ingredient.version != requested_version(data, expected_version):
        raise version_conflict("Ingredient", ingredient.version)
    if not ingredient.is_archived:
        ingredient.is_archived = True
        ingredient.version += 1
        ingredient.updated_by = user.id
        ingredient.updated_at = utcnow()
        audit(db, user, "ingredient.archive", {"ingredient_id": ingredient.id, "version": ingredient.version})
        db.commit()
    return ingredient_out(get_ingredient(ingredient.id, db))


@ingredients_router.post("/{ingredient_id}/restore", response_model=IngredientOut, summary="Restore an archived ingredient")
def restore_ingredient(
    ingredient_id: str,
    data: ArchiveRequest | None = None,
    expected_version: int | None = Query(None, ge=1),
    user: User = Depends(get_current_admin_jwt),
    db: Session = Depends(get_db),
):
    ingredient = get_ingredient(ingredient_id, db)
    if ingredient.version != requested_version(data, expected_version):
        raise version_conflict("Ingredient", ingredient.version)
    if ingredient.is_archived:
        ingredient.is_archived = False
        ingredient.version += 1
        ingredient.updated_by = user.id
        ingredient.updated_at = utcnow()
        audit(db, user, "ingredient.restore", {"ingredient_id": ingredient.id, "version": ingredient.version})
        db.commit()
    return ingredient_out(get_ingredient(ingredient.id, db))


# ─── Meal helpers and CRUD ───────────────────────────────────────────────


def resolve_ingredient(
    row: MealIngredientInput,
    user: User,
    db: Session,
    allowed_archived_ids: set[str] | None = None,
) -> Ingredient:
    allowed_archived_ids = allowed_archived_ids or set()
    if row.ingredient_id:
        ingredient = db.query(Ingredient).filter(Ingredient.id == row.ingredient_id).first()
        if not ingredient:
            raise HTTPException(status_code=422, detail=f"Ingredient not found: {row.ingredient_id}")
    else:
        normalized = normalize_name(row.name or "")
        ingredient = db.query(Ingredient).filter(Ingredient.normalized_name == normalized).first()
        if not ingredient:
            validate_category(row.category_id, db)
            ingredient = Ingredient(
                name=" ".join((row.name or "").strip().split()),
                normalized_name=normalized,
                default_unit=row.unit.strip(),
                default_category_id=row.category_id,
                created_by=user.id,
                updated_by=user.id,
            )
            db.add(ingredient)
            db.flush()
            audit(db, user, "ingredient.create", {"ingredient_id": ingredient.id, "name": ingredient.name})
    if ingredient.is_archived and ingredient.id not in allowed_archived_ids:
        raise HTTPException(status_code=422, detail=f"Archived ingredient cannot be selected: {ingredient.name}")
    return ingredient


def replace_meal_rows(
    meal: Meal,
    rows: list[MealIngredientInput],
    user: User,
    db: Session,
    allowed_archived_ids: set[str] | None = None,
) -> None:
    resolved: list[tuple[MealIngredientInput, Ingredient]] = []
    seen: set[str] = set()
    for row in rows:
        validate_category(row.category_id, db)
        ingredient = resolve_ingredient(row, user, db, allowed_archived_ids)
        if ingredient.id in seen:
            raise HTTPException(status_code=422, detail=f"Duplicate meal ingredient: {ingredient.name}")
        seen.add(ingredient.id)
        resolved.append((row, ingredient))

    meal.ingredients.clear()
    db.flush()
    for index, (row, ingredient) in enumerate(resolved):
        meal.ingredients.append(MealIngredient(
            ingredient_id=ingredient.id,
            quantity=row.quantity,
            unit=row.unit.strip(),
            category_id=row.category_id,
            notes=row.notes,
            scales_with_servings=row.scales_with_servings,
            sort_order=index,
        ))


@meals_router.get("", response_model=list[MealOut], summary="List global meals")
def list_meals(
    q: str = "",
    include_archived: bool = False,
    user: User = Depends(get_current_user_read),
    db: Session = Depends(get_db),
):
    require_admin_archived_view(include_archived, user)
    query = db.query(Meal).options(
        joinedload(Meal.creator),
        joinedload(Meal.updater),
        joinedload(Meal.ingredients).joinedload(MealIngredient.ingredient),
        joinedload(Meal.ingredients).joinedload(MealIngredient.category),
    )
    if not include_archived:
        query = query.filter(Meal.is_archived == False)
    if q.strip():
        escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(Meal.name.ilike(f"%{escaped}%", escape="\\"))
    return [meal_out(meal) for meal in query.order_by(Meal.name, Meal.created_at).all()]


@meals_router.post("", response_model=MealOut, status_code=201, summary="Create a global meal")
def create_meal(
    data: MealCreate,
    user: User = Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    meal = Meal(
        name=data.name.strip(),
        description=data.description,
        base_servings=data.base_servings,
        source_url=data.source_url,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(meal)
    try:
        db.flush()
        replace_meal_rows(meal, data.ingredients, user, db)
        audit(db, user, "meal.create", {"meal_id": meal.id, "name": meal.name})
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A catalogue ingredient was created concurrently")
    return meal_out(get_meal(meal.id, db))


@meals_router.post("/import-recipe/preview", response_model=RecipeImportPreview, summary="Preview a URL recipe as a meal")
async def preview_meal_recipe(
    data: RecipeMealCreateRequest,
    user: User = Depends(get_current_user_write),
):
    try:
        return RecipeImportPreview(**(await fetch_recipe(data.url)))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=422, detail="Failed to fetch or parse the recipe URL.")


@meals_router.post("/import-recipe", response_model=MealOut, status_code=201, summary="Create a global meal from a URL recipe")
async def create_meal_from_recipe(
    data: RecipeMealCreateRequest,
    user: User = Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    try:
        recipe = await fetch_recipe(data.url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=422, detail="Failed to fetch or parse the recipe URL.")
    meal_data = MealCreate(
        name=recipe["title"],
        description=data.description or f"Imported from {recipe['source']}",
        base_servings=data.base_servings,
        source_url=data.url,
        ingredients=[MealIngredientInput(**row) for row in recipe["ingredients"]],
    )
    return create_meal(meal_data, user, db)


@meals_router.get("/{meal_id}", response_model=MealOut, summary="Get a global meal")
def read_meal(
    meal_id: str,
    user: User = Depends(get_current_user_read),
    db: Session = Depends(get_db),
):
    meal = get_meal(meal_id, db)
    if meal.is_archived and (
        not user.is_admin or getattr(user, "_auth_method", None) != "jwt"
    ):
        raise HTTPException(status_code=404, detail="Meal not found")
    return meal_out(meal)


@meals_router.put("/{meal_id}", response_model=MealOut, summary="Atomically replace a global meal")
def update_meal(
    meal_id: str,
    data: MealUpdate,
    user: User = Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    meal = get_meal(meal_id, db)
    if meal.is_archived:
        raise HTTPException(status_code=409, detail="Archived meals cannot be edited")
    if meal.version != data.expected_version:
        raise version_conflict("Meal", meal.version)
    allowed_archived = {row.ingredient_id for row in meal.ingredients}
    meal.name = data.name.strip()
    meal.description = data.description
    meal.base_servings = data.base_servings
    meal.source_url = data.source_url
    meal.updated_by = user.id
    meal.updated_at = utcnow()
    meal.version += 1
    try:
        replace_meal_rows(meal, data.ingredients, user, db, allowed_archived)
        audit(db, user, "meal.update", {"meal_id": meal.id, "version": meal.version})
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A catalogue ingredient was created concurrently")
    return meal_out(get_meal(meal.id, db))


@meals_router.delete("/{meal_id}", response_model=MealOut, summary="Archive a global meal")
def archive_meal(
    meal_id: str,
    data: ArchiveRequest | None = None,
    expected_version: int | None = Query(None, ge=1),
    user: User = Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    meal = get_meal(meal_id, db)
    require_archive_permission(meal.created_by, user)
    if meal.version != requested_version(data, expected_version):
        raise version_conflict("Meal", meal.version)
    if not meal.is_archived:
        meal.is_archived = True
        meal.version += 1
        meal.updated_by = user.id
        meal.updated_at = utcnow()
        audit(db, user, "meal.archive", {"meal_id": meal.id, "version": meal.version})
        db.commit()
    return meal_out(get_meal(meal.id, db))


@meals_router.post("/{meal_id}/restore", response_model=MealOut, summary="Restore an archived meal")
def restore_meal(
    meal_id: str,
    data: ArchiveRequest | None = None,
    expected_version: int | None = Query(None, ge=1),
    user: User = Depends(get_current_admin_jwt),
    db: Session = Depends(get_db),
):
    meal = get_meal(meal_id, db)
    if meal.version != requested_version(data, expected_version):
        raise version_conflict("Meal", meal.version)
    if meal.is_archived:
        meal.is_archived = False
        meal.version += 1
        meal.updated_by = user.id
        meal.updated_at = utcnow()
        audit(db, user, "meal.restore", {"meal_id": meal.id, "version": meal.version})
        db.commit()
    return meal_out(get_meal(meal.id, db))


# ─── Basics CRUD ────────────────────────────────────────────────────────


@basics_router.get("", response_model=BasicsOut, summary="Get the shared Basics checklist")
def read_basics(
    include_archived: bool = False,
    user: User = Depends(get_current_user_read),
    db: Session = Depends(get_db),
):
    require_admin_archived_view(include_archived, user)
    return basics_out(get_basics(db), include_archived)


@basics_router.post("/items", response_model=BasicsItemOut, status_code=201, summary="Add a Basics entry")
def create_basics_item(
    data: BasicsItemCreate,
    user: User = Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    collection = ensure_basics(db)
    if collection.version != data.expected_version:
        raise version_conflict("Basics", collection.version)
    validate_category(data.category_id, db)
    try:
        ingredient = resolve_ingredient(data, user, db)
        existing = db.query(BasicsItem).filter(
            BasicsItem.collection_id == collection.id, BasicsItem.ingredient_id == ingredient.id
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="This ingredient is already in Basics")
        max_sort = db.query(func.max(BasicsItem.sort_order)).filter(
            BasicsItem.collection_id == collection.id
        ).scalar()
        row = BasicsItem(
            collection_id=collection.id,
            ingredient_id=ingredient.id,
            quantity=data.quantity,
            unit=data.unit.strip(),
            category_id=data.category_id,
            notes=data.notes,
            scales_with_servings=data.scales_with_servings,
            sort_order=(max_sort + 1) if max_sort is not None else 0,
            created_by=user.id,
            updated_by=user.id,
        )
        db.add(row)
        collection.version += 1
        collection.updated_by = user.id
        collection.updated_at = utcnow()
        db.flush()
        audit(db, user, "basics.create", {"item_id": row.id, "ingredient_id": ingredient.id})
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="This ingredient is already in Basics")
    loaded = next(item for item in get_basics(db).items if item.id == row.id)
    return basics_item_out(loaded)


@basics_router.put("/items/{item_id}", response_model=BasicsItemOut, summary="Update a Basics entry")
def update_basics_item(
    item_id: str,
    data: BasicsItemUpdate,
    user: User = Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    row = db.query(BasicsItem).filter(BasicsItem.id == item_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Basics item not found")
    if row.is_archived:
        raise HTTPException(status_code=409, detail="Archived Basics entries cannot be edited")
    if row.version != data.expected_version:
        raise version_conflict("Basics item", row.version)
    if data.quantity is not None:
        row.quantity = data.quantity
    if data.unit is not None:
        row.unit = data.unit.strip()
    if "category_id" in data.model_fields_set:
        validate_category(data.category_id, db)
        row.category_id = data.category_id
    if data.notes is not None:
        row.notes = data.notes
    if data.scales_with_servings is not None:
        row.scales_with_servings = data.scales_with_servings
    row.version += 1
    row.updated_by = user.id
    row.updated_at = utcnow()
    collection = ensure_basics(db)
    collection.version += 1
    collection.updated_by = user.id
    collection.updated_at = utcnow()
    audit(db, user, "basics.update", {"item_id": row.id, "version": row.version})
    db.commit()
    loaded = next(item for item in get_basics(db).items if item.id == item_id)
    return basics_item_out(loaded)


@basics_router.delete("/items/{item_id}", response_model=BasicsItemOut, summary="Archive a Basics entry")
def archive_basics_item(
    item_id: str,
    data: ArchiveRequest | None = None,
    expected_version: int | None = Query(None, ge=1),
    user: User = Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    row = db.query(BasicsItem).filter(BasicsItem.id == item_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Basics item not found")
    require_archive_permission(row.created_by, user)
    if row.version != requested_version(data, expected_version):
        raise version_conflict("Basics item", row.version)
    if not row.is_archived:
        row.is_archived = True
        row.version += 1
        row.updated_by = user.id
        row.updated_at = utcnow()
        collection = ensure_basics(db)
        collection.version += 1
        collection.updated_by = user.id
        collection.updated_at = utcnow()
        audit(db, user, "basics.archive", {"item_id": row.id, "version": row.version})
        db.commit()
    loaded = next(item for item in get_basics(db).items if item.id == item_id)
    return basics_item_out(loaded)


@basics_router.post("/items/{item_id}/restore", response_model=BasicsItemOut, summary="Restore a Basics entry")
def restore_basics_item(
    item_id: str,
    data: ArchiveRequest | None = None,
    expected_version: int | None = Query(None, ge=1),
    user: User = Depends(get_current_admin_jwt),
    db: Session = Depends(get_db),
):
    row = db.query(BasicsItem).filter(BasicsItem.id == item_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Basics item not found")
    if row.version != requested_version(data, expected_version):
        raise version_conflict("Basics item", row.version)
    if row.is_archived:
        row.is_archived = False
        row.version += 1
        row.updated_by = user.id
        row.updated_at = utcnow()
        collection = ensure_basics(db)
        collection.version += 1
        collection.updated_by = user.id
        collection.updated_at = utcnow()
        audit(db, user, "basics.restore", {"item_id": row.id, "version": row.version})
        db.commit()
    loaded = next(item for item in get_basics(db).items if item.id == item_id)
    return basics_item_out(loaded)


@basics_router.post("/reorder", response_model=BasicsOut, summary="Reorder the Basics checklist")
def reorder_basics(
    data: BasicsReorderRequest,
    user: User = Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    collection = ensure_basics(db)
    if collection.version != data.expected_version:
        raise version_conflict("Basics", collection.version)
    active = db.query(BasicsItem).filter(
        BasicsItem.collection_id == collection.id, BasicsItem.is_archived == False
    ).all()
    active_ids = {row.id for row in active}
    if len(data.item_ids) != len(set(data.item_ids)) or set(data.item_ids) != active_ids:
        raise HTTPException(status_code=422, detail="item_ids must contain every active Basics item exactly once")
    by_id = {row.id: row for row in active}
    for index, item_id in enumerate(data.item_ids):
        by_id[item_id].sort_order = index
        by_id[item_id].updated_by = user.id
        by_id[item_id].updated_at = utcnow()
        by_id[item_id].version += 1
    collection.version += 1
    collection.updated_by = user.id
    collection.updated_at = utcnow()
    audit(db, user, "basics.reorder", {"item_ids": data.item_ids, "version": collection.version})
    db.commit()
    return basics_out(get_basics(db))


# ─── Preview and idempotent bulk commit ───────────────────────────────────────────


def existing_matches(list_id: str, db: Session) -> dict[tuple[str, str], ListItem]:
    result: dict[tuple[str, str], ListItem] = {}
    items = db.query(ListItem).filter(ListItem.list_id == list_id).order_by(ListItem.checked, ListItem.created_at).all()
    for item in items:
        result.setdefault((normalize_name(item.name), normalize_unit(item.unit)), item)
    return result


def preview_rows(
    source_type: str,
    source_id: str,
    source_version: int,
    rows,
    list_id: str,
    target_servings: int,
    factor: float,
    db: Session,
) -> LibraryPreviewOut:
    matches = existing_matches(list_id, db)
    output = []
    for row in rows:
        quantity = round(row.quantity * factor, 3) if row.scales_with_servings else row.quantity
        match = matches.get((normalize_name(row.ingredient.name), normalize_unit(row.unit)))
        category_id = row.category_id or row.ingredient.default_category_id or remembered_category(
            row.ingredient.name, db
        )
        category = db.query(Category).filter(Category.id == category_id).first() if category_id else None
        output.append(LibraryPreviewRow(
            source_row_id=row.id,
            ingredient_id=row.ingredient_id,
            name=row.ingredient.name,
            quantity=quantity,
            unit=row.unit,
            category_id=category_id,
            category_name=category.name if category else None,
            notes=row.notes,
            scales_with_servings=row.scales_with_servings,
            existing_item_id=match.id if match else None,
            matches_existing=match is not None,
            selected=match is None,
        ))
    return LibraryPreviewOut(
        source_type=source_type,
        source_id=source_id,
        source_version=source_version,
        list_id=list_id,
        target_servings=target_servings,
        rows=output,
    )


@meals_router.post("/{meal_id}/preview", response_model=LibraryPreviewOut, summary="Preview adding a meal to a list")
def preview_meal_add(
    meal_id: str,
    data: LibraryPreviewRequest,
    user: User = Depends(get_current_user_read),
    db: Session = Depends(get_db),
):
    check_list_access(data.list_id, user.id, db)
    meal = get_meal(meal_id, db)
    if meal.is_archived:
        raise HTTPException(status_code=404, detail="Meal not found")
    return preview_rows(
        "meal", meal.id, meal.version, meal.ingredients, data.list_id,
        data.target_servings, data.target_servings / meal.base_servings, db,
    )


@basics_router.post("/preview", response_model=LibraryPreviewOut, summary="Preview adding Basics to a list")
def preview_basics_add(
    data: LibraryPreviewRequest,
    user: User = Depends(get_current_user_read),
    db: Session = Depends(get_db),
):
    check_list_access(data.list_id, user.id, db)
    collection = get_basics(db)
    rows = [row for row in collection.items if not row.is_archived]
    return preview_rows(
        "basics", collection.id, collection.version, rows, data.list_id,
        data.target_servings, float(data.target_servings), db,
    )


def request_hash(source_type: str, source_id: str, data: LibraryCommitRequest) -> str:
    payload = {
        "source_type": source_type,
        "source_id": source_id,
        "list_id": data.list_id,
        "target_servings": data.target_servings,
        "source_version": data.source_version,
        "selected_source_row_ids": sorted(data.selected_source_row_ids),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def remembered_category(name: str, db: Session) -> str | None:
    memory = db.query(ItemCategoryMemory).filter(
        ItemCategoryMemory.item_name_lower == normalize_name(name)
    ).order_by(ItemCategoryMemory.usage_count.desc()).first()
    return memory.category_id if memory and memory.category else None


def list_item_json(item: ListItem, db: Session) -> dict:
    category = db.query(Category).filter(Category.id == item.category_id).first() if item.category_id else None
    added_user = db.query(User).filter(User.id == item.added_by).first()
    return {
        "id": item.id,
        "list_id": item.list_id,
        "name": item.name,
        "quantity": item.quantity,
        "unit": item.unit,
        "category_id": item.category_id,
        "category_name": category.name if category else None,
        "category_color": category.color if category else None,
        "category_icon": category.icon if category else None,
        "checked": item.checked,
        "checked_by": item.checked_by,
        "checked_at": item.checked_at.isoformat() if item.checked_at else None,
        "added_by": item.added_by,
        "added_by_name": display_name(added_user),
        "notes": item.notes,
        "sort_order": item.sort_order,
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
    }


async def commit_rows(
    source_type: str,
    source_id: str,
    current_version: int,
    rows,
    factor: float,
    data: LibraryCommitRequest,
    user: User,
    db: Session,
) -> dict:
    digest = request_hash(source_type, source_id, data)
    receipt = db.query(BulkAddReceipt).filter(
        BulkAddReceipt.user_id == user.id, BulkAddReceipt.request_id == data.request_id
    ).first()
    if receipt:
        if receipt.request_hash != digest:
            raise HTTPException(status_code=409, detail="request_id was already used with different data")
        return json.loads(receipt.result_json)

    check_list_access(data.list_id, user.id, db, require_edit=True)
    if current_version != data.source_version:
        raise version_conflict("Source", current_version)

    row_map = {row.id: row for row in rows}
    selected_ids = data.selected_source_row_ids
    if len(selected_ids) != len(set(selected_ids)) or not set(selected_ids).issubset(row_map):
        raise HTTPException(status_code=422, detail="Selected source rows are invalid or duplicated")

    matches = existing_matches(data.list_id, db)
    max_sort = db.query(func.max(ListItem.sort_order)).filter(ListItem.list_id == data.list_id).scalar()
    next_sort = (max_sort + 1) if max_sort is not None else 0
    affected: list[tuple[str, ListItem]] = []
    added_count = 0
    updated_count = 0

    try:
        for row_id in selected_ids:
            row = row_map[row_id]
            quantity = round(row.quantity * factor, 3) if row.scales_with_servings else row.quantity
            key = (normalize_name(row.ingredient.name), normalize_unit(row.unit))
            existing = matches.get(key)
            if existing:
                existing.quantity = round(existing.quantity + quantity, 3)
                existing.checked = False
                existing.checked_by = None
                existing.checked_at = None
                existing.updated_at = utcnow()
                affected.append(("item_updated", existing))
                updated_count += 1
            else:
                category_id = row.category_id or row.ingredient.default_category_id or remembered_category(
                    row.ingredient.name, db
                )
                item = ListItem(
                    list_id=data.list_id,
                    name=row.ingredient.name,
                    quantity=quantity,
                    unit=row.unit,
                    category_id=category_id,
                    checked=False,
                    added_by=user.id,
                    notes=row.notes,
                    sort_order=next_sort,
                )
                next_sort += 1
                db.add(item)
                db.flush()
                matches[key] = item
                affected.append(("item_added", item))
                added_count += 1

        db.query(ShoppingList).filter(ShoppingList.id == data.list_id).update(
            {ShoppingList.updated_at: utcnow()}, synchronize_session=False
        )
        db.flush()
        result = {
            "request_id": data.request_id,
            "source_type": source_type,
            "source_id": source_id,
            "source_version": current_version,
            "list_id": data.list_id,
            "added_count": added_count,
            "updated_count": updated_count,
            "items": [list_item_json(item, db) for _, item in affected],
            "replayed": False,
        }
        db.add(BulkAddReceipt(
            user_id=user.id,
            request_id=data.request_id,
            source_type=source_type,
            source_id=source_id,
            list_id=data.list_id,
            request_hash=digest,
            result_json=json.dumps(result, sort_keys=True),
        ))
        audit(db, user, f"{source_type}.bulk_add", {
            "source_id": source_id,
            "source_version": current_version,
            "list_id": data.list_id,
            "request_id": data.request_id,
            "added_count": added_count,
            "updated_count": updated_count,
        })
        db.commit()
    except IntegrityError:
        db.rollback()
        concurrent = db.query(BulkAddReceipt).filter(
            BulkAddReceipt.user_id == user.id, BulkAddReceipt.request_id == data.request_id
        ).first()
        if concurrent and concurrent.request_hash == digest:
            return json.loads(concurrent.result_json)
        raise HTTPException(status_code=409, detail="request_id was already used with different data")
    except Exception:
        db.rollback()
        raise

    username = display_name(user)
    for event_type, item in affected:
        payload = list_item_json(item, db)
        await manager.broadcast_to_list(data.list_id, {
            "type": event_type,
            "list_id": data.list_id,
            "data": payload,
            "user_id": user.id,
            "username": username,
        })
    return result


@meals_router.post("/{meal_id}/commit", response_model=LibraryCommitOut, summary="Add selected meal rows to a list")
async def commit_meal_add(
    meal_id: str,
    data: LibraryCommitRequest,
    user: User = Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    meal = get_meal(meal_id, db)
    if meal.is_archived:
        raise HTTPException(status_code=404, detail="Meal not found")
    return await commit_rows(
        "meal", meal.id, meal.version, meal.ingredients,
        data.target_servings / meal.base_servings, data, user, db,
    )


@basics_router.post("/commit", response_model=LibraryCommitOut, summary="Add selected Basics rows to a list")
async def commit_basics_add(
    data: LibraryCommitRequest,
    user: User = Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    collection = get_basics(db)
    rows = [row for row in collection.items if not row.is_archived]
    return await commit_rows(
        "basics", collection.id, collection.version, rows,
        float(data.target_servings), data, user, db,
    )
