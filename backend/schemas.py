from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import AliasChoices, BaseModel, Field, model_validator


# ─── Auth ───────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=8)
    display_name: Optional[str] = None
    invite_code: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    display_name: Optional[str]
    is_admin: bool
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    email: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


# ─── Categories ─────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    icon: str = "tag"
    color: str = "#6b7280"
    sort_order: int = 0

    model_config = {
        "json_schema_extra": {
            "examples": [{"name": "Pet Supplies", "icon": "tag", "color": "#f97316", "sort_order": 15}]
        }
    }


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


class CategoryOut(BaseModel):
    id: str
    name: str
    icon: str
    color: str
    sort_order: int
    is_default: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Lists ──────────────────────────────────────────────────────────

class ListCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    color: str = "#6366f1"
    icon: str = "shopping-cart"

    model_config = {
        "json_schema_extra": {
            "examples": [{
                "name": "Weekly Groceries",
                "description": "Shopping for the week",
                "color": "#22c55e",
                "icon": "shopping-cart",
            }]
        }
    }


class ListUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_archived: Optional[bool] = None


class ListMemberOut(BaseModel):
    id: str
    user_id: str
    username: str
    display_name: Optional[str]
    role: str
    joined_at: datetime

    class Config:
        from_attributes = True


class ListOut(BaseModel):
    id: str
    name: str
    description: str
    owner_id: str
    color: str
    icon: str
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    checked_count: int = 0
    members: list[ListMemberOut] = []

    class Config:
        from_attributes = True


class ListShareCreate(BaseModel):
    username: str
    role: str = Field("editor", pattern="^(editor|viewer)$")

    model_config = {"json_schema_extra": {"examples": [{"username": "partner", "role": "editor"}]}}


# ─── Items ──────────────────────────────────────────────────────────

class ItemCreate(BaseModel):
    id: Optional[UUID] = None
    name: str = Field(..., min_length=1, max_length=200)
    quantity: float = 1.0
    unit: str = ""
    category_id: Optional[str] = None
    notes: str = ""
    sort_order: int = 0

    model_config = {
        "json_schema_extra": {
            "examples": [{"name": "Milk", "quantity": 2, "unit": "pints", "notes": "Semi-skimmed"}]
        }
    }


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category_id: Optional[str] = None
    checked: Optional[bool] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None

    model_config = {"json_schema_extra": {"examples": [{"checked": True}]}}


class ItemReorderRequest(BaseModel):
    item_ids: list[str] = Field(..., max_length=1000)

    model_config = {
        "json_schema_extra": {"examples": [{"item_ids": ["first-item-uuid", "second-item-uuid"]}]}
    }


class ClearCheckedRequest(BaseModel):
    item_ids: list[str] = Field(default_factory=list, max_length=1000)


class ItemOut(BaseModel):
    id: str
    list_id: str
    name: str
    quantity: float
    unit: str
    category_id: Optional[str]
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    category_icon: Optional[str] = None
    checked: bool
    checked_by: Optional[str]
    checked_at: Optional[datetime]
    added_by: str
    added_by_name: Optional[str] = None
    notes: str
    sort_order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── API Keys ───────────────────────────────────────────────────────

class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    scopes: Literal["read", "read,write"] = Field(
        "read,write",
        description=(
            "read permits GET requests; read,write also permits resource mutations. "
            "API keys never permit account or admin operations."
        ),
    )

    model_config = {
        "json_schema_extra": {"examples": [{"name": "My shopping agent", "scopes": "read,write"}]}
    }


class ApiKeyOut(BaseModel):
    id: str
    name: str
    key_prefix: str
    scopes: str
    is_active: bool
    last_used: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class ApiKeyCreated(ApiKeyOut):
    key: str  # full key, only shown once at creation


# ─── Invite Codes ───────────────────────────────────────────────────

class InviteCodeCreate(BaseModel):
    pass


class InviteCodeOut(BaseModel):
    id: str
    code: str
    is_used: bool
    created_at: datetime
    expires_at: Optional[datetime]

    class Config:
        from_attributes = True


# ─── Item Suggestions ──────────────────────────────────────────────

class ItemSuggestion(BaseModel):
    name: str
    category_id: Optional[str]
    category_name: Optional[str]
    usage_count: int


# ─── Recipe Import ─────────────────────────────────────────────────

class RecipeImportRequest(BaseModel):
    url: str = Field(..., min_length=10, max_length=2000)

    model_config = {
        "json_schema_extra": {"examples": [{"url": "https://example.com/recipe"}]}
    }


class RecipeIngredientOut(BaseModel):
    name: str
    quantity: float
    unit: str


class RecipeImportPreview(BaseModel):
    title: str
    source: str
    ingredients: list[RecipeIngredientOut]


class RecipeImportResult(BaseModel):
    title: str
    source: str
    added_count: int
    items: list[ItemOut]


# ─── WebSocket Messages ────────────────────────────────────────────

class WSMessage(BaseModel):
    type: str  # item_added, item_updated, item_removed, item_checked, list_updated
    list_id: str
    data: dict
    user_id: str
    username: str


# ─── Global ingredients, meals, and Basics ──────────────────────────────


class IngredientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    default_unit: str = Field("", max_length=30)
    default_category_id: Optional[str] = None

    model_config = {"json_schema_extra": {"examples": [{
        "name": "Chickpeas", "default_unit": "g", "default_category_id": None,
    }]}}


class IngredientUpdate(BaseModel):
    expected_version: int = Field(..., ge=1)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    default_unit: Optional[str] = Field(None, max_length=30)
    default_category_id: Optional[str] = None


class IngredientOut(BaseModel):
    id: str
    name: str
    normalized_name: str
    default_unit: str
    default_category_id: Optional[str]
    default_category_name: Optional[str] = None
    version: int
    is_archived: bool
    created_by: str
    created_by_name: Optional[str] = None
    updated_by: str
    updated_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ArchiveRequest(BaseModel):
    expected_version: int = Field(..., ge=1)

    model_config = {"json_schema_extra": {"examples": [{"expected_version": 3}]}}


class MealIngredientInput(BaseModel):
    ingredient_id: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    quantity: float = Field(1.0, gt=0)
    unit: str = Field("", max_length=30)
    category_id: Optional[str] = None
    notes: str = ""
    scales_with_servings: bool = True

    @model_validator(mode="after")
    def exactly_one_reference(self):
        if bool(self.ingredient_id) == bool(self.name and self.name.strip()):
            raise ValueError("Supply exactly one of ingredient_id or name")
        return self


class MealCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    base_servings: int = Field(1, ge=1)
    source_url: Optional[str] = Field(None, max_length=2000)
    ingredients: list[MealIngredientInput] = Field(..., min_length=1, max_length=500)

    model_config = {"json_schema_extra": {"examples": [{
        "name": "Tomato pasta",
        "description": "A quick supper",
        "base_servings": 2,
        "ingredients": [
            {"name": "Pasta", "quantity": 200, "unit": "g"},
            {"name": "Salt", "quantity": 1, "unit": "pinch", "scales_with_servings": False},
        ],
    }]}}


class MealUpdate(MealCreate):
    expected_version: int = Field(..., ge=1)


class MealIngredientOut(BaseModel):
    id: str
    ingredient_id: str
    name: str
    ingredient_archived: bool
    quantity: float
    unit: str
    category_id: Optional[str]
    category_name: Optional[str] = None
    notes: str
    scales_with_servings: bool
    sort_order: int


class MealOut(BaseModel):
    id: str
    name: str
    description: str
    base_servings: int
    source_url: Optional[str]
    version: int
    is_archived: bool
    created_by: str
    created_by_name: Optional[str] = None
    updated_by: str
    updated_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    ingredients: list[MealIngredientOut]


class BasicsItemCreate(MealIngredientInput):
    expected_version: int = Field(..., ge=1, description="Expected Basics collection version")


class BasicsItemUpdate(BaseModel):
    expected_version: int = Field(..., ge=1, description="Expected item version")
    quantity: Optional[float] = Field(None, gt=0)
    unit: Optional[str] = Field(None, max_length=30)
    category_id: Optional[str] = None
    notes: Optional[str] = None
    scales_with_servings: Optional[bool] = None


class BasicsItemOut(MealIngredientOut):
    version: int
    is_archived: bool
    created_by: str
    created_by_name: Optional[str] = None
    updated_by: str
    updated_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class BasicsOut(BaseModel):
    id: str
    name: str
    version: int
    updated_by: Optional[str]
    updated_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    items: list[BasicsItemOut]


class BasicsReorderRequest(BaseModel):
    expected_version: int = Field(..., ge=1)
    item_ids: list[str] = Field(..., max_length=1000)

    model_config = {"json_schema_extra": {"examples": [{
        "expected_version": 4,
        "item_ids": ["first-basics-row-uuid", "second-basics-row-uuid"],
    }]}}


class LibraryPreviewRequest(BaseModel):
    list_id: str
    target_servings: int = Field(1, ge=1)

    model_config = {"json_schema_extra": {"examples": [{
        "list_id": "destination-list-uuid", "target_servings": 4,
    }]}}


class LibraryPreviewRow(BaseModel):
    source_row_id: str
    ingredient_id: str
    name: str
    quantity: float
    unit: str
    category_id: Optional[str]
    category_name: Optional[str] = None
    notes: str
    scales_with_servings: bool
    existing_item_id: Optional[str] = None
    matches_existing: bool
    selected: bool


class LibraryPreviewOut(BaseModel):
    source_type: str
    source_id: str
    source_version: int
    list_id: str
    target_servings: int
    rows: list[LibraryPreviewRow]


class LibraryCommitRequest(BaseModel):
    list_id: str
    target_servings: int = Field(1, ge=1)
    source_version: int = Field(..., ge=1)
    selected_source_row_ids: list[str] = Field(
        default_factory=list,
        max_length=1000,
        validation_alias=AliasChoices("selected_source_row_ids", "selected_row_ids"),
    )
    request_id: str = Field(..., min_length=8, max_length=100)

    model_config = {"json_schema_extra": {"examples": [{
        "list_id": "destination-list-uuid",
        "target_servings": 4,
        "source_version": 3,
        "selected_source_row_ids": ["source-row-uuid"],
        "request_id": "9ad1ab0e-31ea-4fc6-bc42-a13ba7342893",
    }]}}


class LibraryCommitOut(BaseModel):
    request_id: str
    source_type: str
    source_id: str
    source_version: int
    list_id: str
    added_count: int
    updated_count: int
    items: list[ItemOut]
    replayed: bool = False


class RecipeMealCreateRequest(BaseModel):
    url: str = Field(..., min_length=10, max_length=2000)
    description: str = ""
    base_servings: int = Field(1, ge=1)
