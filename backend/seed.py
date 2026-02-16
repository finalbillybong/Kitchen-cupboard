"""Seed the database with default categories."""
from sqlalchemy.orm import Session
from models import Category

DEFAULT_CATEGORIES = [
    {"name": "Fruit & Veg", "icon": "apple", "color": "#22c55e", "sort_order": 1},
    {"name": "Dairy", "icon": "milk", "color": "#3b82f6", "sort_order": 2},
    {"name": "Meat & Fish", "icon": "beef", "color": "#ef4444", "sort_order": 3},
    {"name": "Bakery", "icon": "croissant", "color": "#f59e0b", "sort_order": 4},
    {"name": "Frozen", "icon": "snowflake", "color": "#06b6d4", "sort_order": 5},
    {"name": "Drinks", "icon": "cup-soda", "color": "#8b5cf6", "sort_order": 6},
    {"name": "Snacks", "icon": "cookie", "color": "#f97316", "sort_order": 7},
    {"name": "Household", "icon": "spray-can", "color": "#64748b", "sort_order": 8},
    {"name": "Personal Care", "icon": "heart-pulse", "color": "#ec4899", "sort_order": 9},
    {"name": "Tinned & Jars", "icon": "package", "color": "#a855f7", "sort_order": 10},
    {"name": "Pasta & Rice", "icon": "wheat", "color": "#eab308", "sort_order": 11},
    {"name": "Condiments", "icon": "flask-round", "color": "#14b8a6", "sort_order": 12},
    {"name": "Other", "icon": "tag", "color": "#6b7280", "sort_order": 99},
]


def seed_categories(db: Session):
    existing = db.query(Category).filter(Category.is_default == True).count()
    if existing > 0:
        return

    for cat_data in DEFAULT_CATEGORIES:
        cat = Category(
            name=cat_data["name"],
            icon=cat_data["icon"],
            color=cat_data["color"],
            sort_order=cat_data["sort_order"],
            is_default=True,
        )
        db.add(cat)
    db.commit()
