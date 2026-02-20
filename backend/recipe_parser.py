"""
Recipe importer — extracts ingredients from recipe URLs using JSON-LD Schema.org markup.

Supports any site that embeds <script type="application/ld+json"> with @type: Recipe,
including BBC Good Food, AllRecipes, Delish, Simply Recipes, Jamie Oliver, NYT Cooking, etc.
"""

import json
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup


@dataclass
class ParsedIngredient:
    name: str
    quantity: float
    unit: str


# Common units with aliases (order matters — longer first to avoid partial matches)
_UNIT_PATTERNS = [
    (r"tablespoons?|tbsps?|tbs", "tbsp"),
    (r"teaspoons?|tsps?", "tsp"),
    (r"cups?", "cup"),
    (r"ounces?|oz", "oz"),
    (r"pounds?|lbs?", "lb"),
    (r"grams?|grammes?|g\b", "g"),
    (r"kilograms?|kilos?|kg", "kg"),
    (r"millili(?:t(?:re|er)s?)?|mls?|ml\b", "ml"),
    (r"li(?:t(?:re|er)s?)?|l\b", "l"),
    (r"pinch(?:es)?", "pinch"),
    (r"bunch(?:es)?", "bunch"),
    (r"cloves?", "clove"),
    (r"slices?", "slice"),
    (r"pieces?|pcs?", "piece"),
    (r"cans?|tins?", "can"),
    (r"packets?|pkts?", "packet"),
    (r"sprigs?", "sprig"),
    (r"handfuls?", "handful"),
    (r"sticks?", "stick"),
    (r"stalks?", "stalk"),
    (r"heads?", "head"),
    (r"rashers?", "rasher"),
    (r"fillets?", "fillet"),
]

# Fraction unicode and text mappings
_FRACTIONS = {
    "½": 0.5, "⅓": 1/3, "⅔": 2/3, "¼": 0.25, "¾": 0.75,
    "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
    "⅙": 1/6, "⅚": 5/6, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
}

# Words to strip from the start of ingredient text
_SKIP_PREFIXES = re.compile(
    r"^(about|approximately|roughly|around|generous|heaped|level|rounded|large|medium|small|extra)\s+",
    re.IGNORECASE,
)


def _parse_fraction(s: str) -> Optional[float]:
    """Parse a fraction string like '1/2' or '¾' or '1 1/2'."""
    s = s.strip()
    # Unicode fractions
    for char, val in _FRACTIONS.items():
        if char in s:
            # e.g., "1½" → 1 + 0.5
            rest = s.replace(char, "").strip()
            base = float(rest) if rest else 0
            return base + val
    # Slash fractions: "1/2", "3/4"
    if "/" in s:
        parts = s.split("/")
        if len(parts) == 2:
            try:
                return float(parts[0]) / float(parts[1])
            except (ValueError, ZeroDivisionError):
                return None
    # Plain number
    try:
        return float(s)
    except ValueError:
        return None


def parse_ingredient(text: str) -> ParsedIngredient:
    """Parse an ingredient string like '200g plain flour' into structured data."""
    original = text.strip()

    # Remove HTML tags if any
    text = re.sub(r"<[^>]+>", "", text).strip()

    # Remove parenthetical notes: "2 eggs (beaten)", "100ml milk (semi-skimmed)"
    text = re.sub(r"\([^)]*\)", "", text).strip()

    # Remove trailing prep instructions after comma: "1 onion, finely diced"
    text = re.sub(r",\s+(?:finely|roughly|freshly|thinly|coarsely|lightly).*$", "", text, flags=re.IGNORECASE).strip()

    # Strip size/descriptor prefixes
    text = _SKIP_PREFIXES.sub("", text).strip()

    quantity = 1.0
    unit = ""
    name = text

    # Try to extract leading quantity — handles "2", "1.5", "½", "1 1/2", "1½"
    # Pattern: optional whole number, optional space, optional fraction
    qty_match = re.match(
        r"^(\d+\s*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+\s*/\s*\d+|\d+\s+\d+\s*/\s*\d+|\d+\.?\d*|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*",
        text,
    )

    if qty_match:
        qty_str = qty_match.group(1).strip()
        # Handle "1 1/2" style (whole + fraction with space)
        space_frac = re.match(r"^(\d+)\s+(\d+/\d+)$", qty_str)
        if space_frac:
            whole = float(space_frac.group(1))
            frac = _parse_fraction(space_frac.group(2))
            quantity = whole + (frac or 0)
        else:
            parsed = _parse_fraction(qty_str)
            if parsed is not None:
                quantity = parsed

        name = text[qty_match.end():].strip()

    # Try to extract unit — check for "200g" style (number glued to unit)
    # or "200 g flour" style (unit after space)
    for pattern, normalized in _UNIT_PATTERNS:
        unit_match = re.match(rf"^({pattern})[\s.,]+(.*)$", name, re.IGNORECASE)
        if unit_match:
            unit = normalized
            name = unit_match.group(2).strip()
            break

    # Also handle case where quantity was like "200g" (no space between number and unit)
    if not unit and qty_match:
        remaining = text[qty_match.end():]
        for pattern, normalized in _UNIT_PATTERNS:
            unit_glued = re.match(rf"^({pattern})\b\s*(.*)", remaining, re.IGNORECASE)
            if unit_glued:
                unit = normalized
                name = unit_glued.group(2).strip()
                break

    # Clean up name
    name = re.sub(r"\s+", " ", name).strip()
    # Remove leading "of " — "200ml of milk" → "milk"
    name = re.sub(r"^of\s+", "", name, flags=re.IGNORECASE).strip()

    # Title case the name
    if name:
        name = name[0].upper() + name[1:]
    else:
        name = original[0].upper() + original[1:] if original else "Unknown ingredient"

    return ParsedIngredient(name=name, quantity=round(quantity, 3), unit=unit)


async def fetch_recipe(url: str) -> dict:
    """
    Fetch a URL, extract JSON-LD Recipe data, and return parsed ingredients.

    Returns:
        {
            "title": "Recipe Name",
            "source": "example.com",
            "ingredients": [
                {"name": "Plain Flour", "quantity": 200, "unit": "g"},
                ...
            ]
        }

    Raises:
        ValueError if no recipe data found.
    """
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=15.0,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; KitchenCupboard/1.0; recipe-importer)",
            "Accept": "text/html",
        },
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    # Find all JSON-LD scripts
    recipe_data = None
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string)
        except (json.JSONDecodeError, TypeError):
            continue

        recipe_data = _find_recipe(data)
        if recipe_data:
            break

    if not recipe_data:
        raise ValueError("No recipe data found on this page. The site may not use Schema.org Recipe markup.")

    # Extract ingredients
    raw_ingredients = recipe_data.get("recipeIngredient", [])
    if not raw_ingredients:
        raise ValueError("Recipe found but no ingredients listed.")

    ingredients = [parse_ingredient(ing) for ing in raw_ingredients if ing.strip()]
    title = recipe_data.get("name", "Imported Recipe")

    source = urlparse(url).netloc.removeprefix("www.")

    return {
        "title": title,
        "source": source,
        "ingredients": [
            {"name": i.name, "quantity": i.quantity, "unit": i.unit}
            for i in ingredients
        ],
    }


def _find_recipe(data) -> Optional[dict]:
    """Recursively search JSON-LD data for a Recipe object."""
    if isinstance(data, dict):
        schema_type = data.get("@type", "")
        # @type can be a string or list
        types = schema_type if isinstance(schema_type, list) else [schema_type]
        if "Recipe" in types:
            return data
        # Check @graph (common wrapper)
        if "@graph" in data:
            return _find_recipe(data["@graph"])
    elif isinstance(data, list):
        for item in data:
            result = _find_recipe(item)
            if result:
                return result
    return None
