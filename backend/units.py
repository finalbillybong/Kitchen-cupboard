"""Only explicit aliases and metric conversions; never infer density or piece weight."""

ALIASES = {
    "g": ("g", 1),
    "gram": ("g", 1),
    "grams": ("g", 1),
    "kg": ("g", 1000),
    "kilogram": ("g", 1000),
    "kilograms": ("g", 1000),
    "ml": ("ml", 1),
    "millilitre": ("ml", 1),
    "millilitres": ("ml", 1),
    "l": ("ml", 1000),
    "litre": ("ml", 1000),
    "litres": ("ml", 1000),
    "tsp": ("tsp", 1),
    "teaspoon": ("tsp", 1),
    "teaspoons": ("tsp", 1),
    "tbsp": ("tbsp", 1),
    "tablespoon": ("tbsp", 1),
    "tablespoons": ("tbsp", 1),
    "tin": ("can", 1),
    "tins": ("can", 1),
    "can": ("can", 1),
    "cans": ("can", 1),
}


def canonical(quantity, unit):
    unit = " ".join((unit or "").casefold().split())
    unit, factor = ALIASES.get(unit, (unit, 1))
    return (round(quantity * factor, 6) if quantity is not None else None), unit


def scaled(quantity, factor, scales=True):
    return round(quantity * factor, 6) if quantity is not None and scales else quantity
