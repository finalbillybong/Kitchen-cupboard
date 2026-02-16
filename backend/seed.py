"""Seed the database with default categories and keyword mappings."""
from sqlalchemy.orm import Session
from models import Category, ItemCategoryMemory

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

    # Seed default keyword mappings for auto-categorization
    _seed_category_memory(db)


# Common items mapped to their default category name
DEFAULT_ITEM_MAPPINGS = {
    "Fruit & Veg": [
        "apple", "apples", "banana", "bananas", "orange", "oranges", "lemon", "lemons",
        "lime", "limes", "grapes", "strawberries", "blueberries", "raspberries",
        "tomato", "tomatoes", "potato", "potatoes", "onion", "onions", "garlic",
        "carrot", "carrots", "broccoli", "spinach", "lettuce", "cucumber", "peppers",
        "bell pepper", "mushrooms", "mushroom", "avocado", "avocados", "celery", "sweetcorn",
        "corn", "peas", "green beans", "courgette", "aubergine", "cabbage", "cauliflower",
        "spring onions", "leek", "leeks", "parsnip", "parsnips", "beetroot",
        "sweet potato", "sweet potatoes", "ginger", "chilli", "kiwi", "mango",
        "pineapple", "melon", "watermelon", "pear", "pears", "plum", "plums",
        "peach", "peaches", "cherries", "fruit", "veg", "vegetables", "salad",
    ],
    "Dairy": [
        "milk", "semi-skimmed milk", "skimmed milk", "whole milk", "oat milk",
        "almond milk", "cheese", "cheddar", "mozzarella", "parmesan", "cream cheese",
        "butter", "cream", "double cream", "single cream", "sour cream",
        "yoghurt", "yogurt", "greek yoghurt", "eggs", "egg",
    ],
    "Meat & Fish": [
        "chicken", "chicken breast", "chicken thighs", "beef", "mince", "steak",
        "pork", "pork chops", "bacon", "sausages", "sausage", "ham", "lamb",
        "turkey", "duck", "salmon", "tuna", "cod", "prawns", "fish", "fish fingers",
        "chicken nuggets", "burgers",
    ],
    "Bakery": [
        "bread", "white bread", "brown bread", "wholemeal bread", "sourdough",
        "rolls", "bread rolls", "baguette", "croissant", "croissants", "muffins",
        "bagels", "bagel", "wraps", "tortillas", "pitta", "pitta bread",
        "crumpets", "pancakes", "scones",
    ],
    "Frozen": [
        "frozen peas", "frozen chips", "ice cream", "frozen pizza", "frozen veg",
        "fish fingers", "frozen berries", "ice lollies", "frozen prawns",
    ],
    "Drinks": [
        "water", "juice", "orange juice", "apple juice", "squash", "cola", "coke",
        "lemonade", "beer", "wine", "tea", "coffee", "hot chocolate",
    ],
    "Snacks": [
        "crisps", "chocolate", "biscuits", "nuts", "popcorn", "cereal bars",
        "sweets", "cake", "cookies",
    ],
    "Household": [
        "washing up liquid", "bin bags", "kitchen roll", "cling film", "tin foil",
        "sponges", "bleach", "cleaning spray", "laundry detergent", "fabric softener",
        "dishwasher tablets", "toilet roll", "toilet paper", "batteries", "light bulbs",
    ],
    "Personal Care": [
        "shampoo", "conditioner", "shower gel", "soap", "toothpaste", "toothbrush",
        "deodorant", "razors", "tissues", "cotton buds", "plasters",
    ],
    "Tinned & Jars": [
        "baked beans", "chopped tomatoes", "tinned tuna", "soup", "tinned soup",
        "jam", "honey", "peanut butter", "nutella", "olives", "pickles",
        "coconut milk", "tinned sweetcorn",
    ],
    "Pasta & Rice": [
        "pasta", "spaghetti", "penne", "fusilli", "rice", "basmati rice",
        "noodles", "egg noodles", "couscous", "lasagne sheets",
    ],
    "Condiments": [
        "ketchup", "mayonnaise", "mustard", "soy sauce", "vinegar",
        "olive oil", "vegetable oil", "salt", "black pepper", "sugar",
        "flour", "stock cubes", "gravy", "herbs", "spices", "chilli flakes",
        "paprika", "cumin", "oregano", "mixed herbs",
    ],
}


def _seed_category_memory(db: Session):
    existing = db.query(ItemCategoryMemory).count()
    if existing > 0:
        return

    categories = {cat.name: cat.id for cat in db.query(Category).filter(Category.is_default == True).all()}

    for cat_name, items in DEFAULT_ITEM_MAPPINGS.items():
        cat_id = categories.get(cat_name)
        if not cat_id:
            continue
        for item_name in items:
            memory = ItemCategoryMemory(
                item_name_lower=item_name.lower(),
                category_id=cat_id,
                usage_count=1,
            )
            db.add(memory)
    db.commit()
