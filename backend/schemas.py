from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


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


class UserPreferences(BaseModel):
    tap_mode: str = Field("two", pattern="^(one|two)$")


# ─── Categories ─────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    icon: str = "tag"
    color: str = "#6b7280"
    sort_order: int = 0


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


# ─── Items ──────────────────────────────────────────────────────────

class ItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    quantity: float = 1.0
    unit: str = ""
    category_id: Optional[str] = None
    notes: str = ""
    sort_order: int = 0


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category_id: Optional[str] = None
    checked: Optional[bool] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None


class ItemReorderRequest(BaseModel):
    item_ids: list[str] = Field(..., max_length=1000)


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
    scopes: str = "read,write"


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
