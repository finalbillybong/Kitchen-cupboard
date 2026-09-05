import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Boolean,
    Integer,
    Float,
    DateTime,
    ForeignKey,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship

from database import Base


def generate_uuid():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(100))
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    lists_owned = relationship("ShoppingList", back_populates="owner")
    list_memberships = relationship("ListMember", back_populates="user")
    api_keys = relationship("ApiKey", back_populates="user")


class ShoppingList(Base):
    __tablename__ = "shopping_lists"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    color = Column(String(7), default="#6366f1")  # hex color
    icon = Column(String(50), default="shopping-cart")
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    owner = relationship("User", back_populates="lists_owned")
    members = relationship("ListMember", back_populates="shopping_list", cascade="all, delete-orphan")
    items = relationship("ListItem", back_populates="shopping_list", cascade="all, delete-orphan")


class ListMember(Base):
    __tablename__ = "list_members"

    id = Column(String, primary_key=True, default=generate_uuid)
    list_id = Column(String, ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), default="editor")  # owner, editor, viewer
    joined_at = Column(DateTime, default=utcnow)

    shopping_list = relationship("ShoppingList", back_populates="members")
    user = relationship("User", back_populates="list_memberships")

    __table_args__ = (
        UniqueConstraint("list_id", "user_id", name="uq_list_member"),
    )


class Category(Base):
    __tablename__ = "categories"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    icon = Column(String(50), default="tag")
    color = Column(String(7), default="#6b7280")
    sort_order = Column(Integer, default=0)
    is_default = Column(Boolean, default=False)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    items = relationship("ListItem", back_populates="category")


class ListItem(Base):
    __tablename__ = "list_items"

    id = Column(String, primary_key=True, default=generate_uuid)
    list_id = Column(String, ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    quantity = Column(Float, default=1.0)
    unit = Column(String(30), default="")
    category_id = Column(String, ForeignKey("categories.id"), nullable=True)
    checked = Column(Boolean, default=False)
    checked_by = Column(String, ForeignKey("users.id"), nullable=True)
    checked_at = Column(DateTime, nullable=True)
    added_by = Column(String, ForeignKey("users.id"), nullable=False)
    notes = Column(Text, default="")
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    shopping_list = relationship("ShoppingList", back_populates="items")
    category = relationship("Category", back_populates="items")
    added_by_user = relationship("User", foreign_keys=[added_by])
    checked_by_user = relationship("User", foreign_keys=[checked_by])

    __table_args__ = (
        Index("ix_list_items_list_sort", "list_id", "checked", "sort_order"),
    )


class ItemCategoryMemory(Base):
    """Remembers which category an item name was assigned to."""
    __tablename__ = "item_category_memory"

    id = Column(String, primary_key=True, default=generate_uuid)
    item_name_lower = Column(String(200), nullable=False, index=True)
    category_id = Column(String, ForeignKey("categories.id"), nullable=False)
    usage_count = Column(Integer, default=1)
    last_used = Column(DateTime, default=utcnow)

    category = relationship("Category")

    __table_args__ = (
        UniqueConstraint("item_name_lower", "category_id", name="uq_item_category"),
        Index("ix_item_memory_lookup", "item_name_lower", "usage_count"),
    )


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    key_hash = Column(String(255), nullable=False)
    key_prefix = Column(String(11), nullable=False)  # "kc_" + first 8 chars
    name = Column(String(100), nullable=False)
    scopes = Column(Text, default="read,write")  # comma-separated
    is_active = Column(Boolean, default=True)
    last_used = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="api_keys")


class AuditLog(Base):
    """Records security-relevant actions for auditing."""
    __tablename__ = "audit_log"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    detail = Column(Text, default="")
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id = Column(String, primary_key=True, default=generate_uuid)
    code = Column(String(20), unique=True, nullable=False, index=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    used_by = Column(String, ForeignKey("users.id"), nullable=True)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)
    expires_at = Column(DateTime, nullable=True)


# ─── Global meal library ─────────────────────────────────────────────────


class Ingredient(Base):
    """One shared, case-insensitively de-duplicated ingredient."""

    __tablename__ = "ingredients"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String(200), nullable=False)
    normalized_name = Column(String(200), nullable=False, unique=True, index=True)
    default_unit = Column(String(30), default="", nullable=False)
    default_category_id = Column(String, ForeignKey("categories.id"), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False, index=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    updated_by = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    default_category = relationship("Category")
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])


class Meal(Base):
    """A globally visible reusable recipe."""

    __tablename__ = "meals"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String(200), nullable=False, index=True)
    description = Column(Text, default="", nullable=False)
    base_servings = Column(Integer, default=1, nullable=False)
    source_url = Column(String(2000), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False, index=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    updated_by = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])
    ingredients = relationship(
        "MealIngredient",
        back_populates="meal",
        cascade="all, delete-orphan",
        order_by="MealIngredient.sort_order",
    )


class MealIngredient(Base):
    __tablename__ = "meal_ingredients"

    id = Column(String, primary_key=True, default=generate_uuid)
    meal_id = Column(String, ForeignKey("meals.id", ondelete="CASCADE"), nullable=False)
    ingredient_id = Column(String, ForeignKey("ingredients.id"), nullable=False)
    quantity = Column(Float, default=1.0, nullable=False)
    unit = Column(String(30), default="", nullable=False)
    category_id = Column(String, ForeignKey("categories.id"), nullable=True)
    notes = Column(Text, default="", nullable=False)
    scales_with_servings = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)

    meal = relationship("Meal", back_populates="ingredients")
    ingredient = relationship("Ingredient")
    category = relationship("Category")

    __table_args__ = (
        UniqueConstraint("meal_id", "ingredient_id", name="uq_meal_ingredient"),
        Index("ix_meal_ingredients_order", "meal_id", "sort_order"),
    )


class BasicsCollection(Base):
    """The single globally shared basics checklist."""

    __tablename__ = "basics_collections"

    id = Column(String, primary_key=True, default="global")
    name = Column(String(100), default="Basics", nullable=False)
    version = Column(Integer, default=1, nullable=False)
    updated_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    updater = relationship("User", foreign_keys=[updated_by])
    items = relationship(
        "BasicsItem",
        back_populates="collection",
        cascade="all, delete-orphan",
        order_by="BasicsItem.sort_order",
    )


class BasicsItem(Base):
    __tablename__ = "basics_items"

    id = Column(String, primary_key=True, default=generate_uuid)
    collection_id = Column(
        String, ForeignKey("basics_collections.id", ondelete="CASCADE"), default="global", nullable=False
    )
    ingredient_id = Column(String, ForeignKey("ingredients.id"), nullable=False)
    quantity = Column(Float, default=1.0, nullable=False)
    unit = Column(String(30), default="", nullable=False)
    category_id = Column(String, ForeignKey("categories.id"), nullable=True)
    notes = Column(Text, default="", nullable=False)
    scales_with_servings = Column(Boolean, default=False, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False, index=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    updated_by = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    collection = relationship("BasicsCollection", back_populates="items")
    ingredient = relationship("Ingredient")
    category = relationship("Category")
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])

    __table_args__ = (
        UniqueConstraint("collection_id", "ingredient_id", name="uq_basics_ingredient"),
        Index("ix_basics_items_order", "collection_id", "sort_order"),
    )


class BulkAddReceipt(Base):
    """Durable response for idempotent meal/Basics commits."""

    __tablename__ = "bulk_add_receipts"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    request_id = Column(String(100), nullable=False)
    source_type = Column(String(20), nullable=False)
    source_id = Column(String, nullable=False)
    list_id = Column(String, ForeignKey("shopping_lists.id"), nullable=False)
    request_hash = Column(String(64), nullable=False)
    result_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "request_id", name="uq_bulk_add_user_request"),
    )
