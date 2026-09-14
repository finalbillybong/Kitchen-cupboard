"""Shared planner and private, reviewed shopping generation."""

import hashlib
import json
import random
import uuid
from datetime import date, timedelta, time, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import update
from sqlalchemy.orm import Session
from access import check_list_access
from auth import get_current_user_read, get_current_user_write, get_current_admin_jwt
from database import get_db
from models import (
    PlannerState,
    PlannerSlot,
    Meal,
    PantryStaple,
    Ingredient,
    GroceryContribution,
    ReviewReceipt,
    ListItem,
    CalendarJob,
    utcnow,
)
from units import canonical, scaled
from websocket_manager import manager

router = APIRouter(prefix="/api/planner", tags=["Planner"])
pantry_router = APIRouter(prefix="/api/pantry", tags=["Pantry"])
DEFAULTS = {
    "enabled_types": ["dinner"],
    "timezone": "Europe/London",
    "times": {"breakfast": "08:00", "lunch": "12:30", "dinner": "18:30"},
    "duration": 60,
}


class PlannerSettings(BaseModel):
    expected_version: int = Field(ge=1)
    enabled_types: list[Literal["breakfast", "lunch", "dinner"]] = ["dinner"]
    timezone: str = "Europe/London"
    times: dict[str, str] = DEFAULTS["times"]
    duration: int = Field(60, ge=1, le=1440)

    @model_validator(mode="after")
    def validate_settings(self):
        try:
            ZoneInfo(self.timezone)
            for meal_type in DEFAULTS["times"]:
                time.fromisoformat(self.times[meal_type])
        except (ZoneInfoNotFoundError, ValueError, KeyError):
            raise ValueError("Supply a valid timezone and all three meal times")
        if not self.enabled_types or len(set(self.enabled_types)) != len(
            self.enabled_types
        ):
            raise ValueError("Enable at least one distinct meal type")
        return self


class SlotInput(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), max_length=100)
    day: date
    meal_type: Literal["breakfast", "lunch", "dinner"] = "dinner"
    kind: Literal["recipe", "leftover", "skip"] = "recipe"
    meal_id: str | None = None
    cooking_slot_id: str | None = None
    servings: int = Field(2, ge=1, le=1000)
    notes: str = Field("", max_length=10000)
    time: str | None = Field(None, pattern=r"^\d{2}:\d{2}$")
    duration: int | None = Field(None, ge=1, le=1440)
    pinned: bool = False


class PlanChange(BaseModel):
    expected_version: int = Field(ge=1)
    slots: list[SlotInput] = Field(default_factory=list, max_length=366)
    remove_ids: list[str] = Field(default_factory=list, max_length=366)


class ReviewCommit(BaseModel):
    token: str
    request_id: str = Field(min_length=8, max_length=100)


def state(db):
    value = db.get(PlannerState, "global")
    if not value:
        value = PlannerState(id="global", settings=DEFAULTS.copy())
        db.add(value)
        db.flush()
    return value


def lock(db, version):
    state(db)
    changed = db.execute(
        update(PlannerState)
        .where(PlannerState.id == "global", PlannerState.version == version)
        .values(version=version + 1)
        .execution_options(synchronize_session=False)
    )
    if changed.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "Planner changed. Reload and review again.")
    db.expire_all()


def slot_json(slot):
    return {c.name: getattr(slot, c.name) for c in PlannerSlot.__table__.columns}


def week_start(week):
    value = date.fromisoformat(str(week))
    return value - timedelta(days=value.weekday())


def snapshot(db):
    st = state(db)
    return {
        "version": st.version,
        "settings": st.settings or DEFAULTS,
        "slots": [
            slot_json(s)
            for s in db.query(PlannerSlot)
            .order_by(PlannerSlot.day, PlannerSlot.time)
            .all()
        ],
    }


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, default=str).encode()
    ).hexdigest()


def queue_sync(db, ids):
    for slot_id in set(ids):
        job = db.get(CalendarJob, slot_id)
        if job:
            job.revision += 1
            job.due_at = utcnow()
            job.attempts = 0
        else:
            db.add(CalendarJob(slot_id=slot_id))


def validate_plan(slots, settings, db):
    positions = set()
    for slot in slots.values():
        position = slot["day"], slot["meal_type"]
        if position in positions:
            raise HTTPException(
                422, "A meal already occupies this position; use move/swap"
            )
        positions.add(position)
        try:
            local = datetime.fromisoformat(f"{slot['day']}T{slot['time']}").replace(
                tzinfo=ZoneInfo(settings["timezone"])
            )
            if local.astimezone(timezone.utc).astimezone(local.tzinfo).replace(
                tzinfo=None
            ) != local.replace(tzinfo=None):
                raise ValueError()
        except ValueError:
            raise HTTPException(
                422,
                "Invalid time, or local time does not exist during daylight-saving transition",
            )
        if slot["kind"] == "recipe":
            meal = db.get(Meal, slot["meal_id"]) if slot["meal_id"] else None
            existing = (
                db.get(PlannerSlot, slot["id"]) if meal and meal.is_archived else None
            )
            retained = (
                existing and existing.kind == "recipe" and existing.meal_id == meal.id
            )
            if not meal or (meal.is_archived and not retained):
                raise HTTPException(422, "Select an active saved recipe")
            if slot["cooking_slot_id"]:
                raise HTTPException(
                    422, "Cooking sessions cannot link to another session"
                )
        elif slot["kind"] == "leftover":
            parent = slots.get(slot["cooking_slot_id"])
            if not parent or parent["kind"] != "recipe":
                raise HTTPException(
                    422,
                    "Review linked leftovers: remove them or reassign to a cooking session",
                )
            if (slot["day"], slot["time"]) <= (parent["day"], parent["time"]):
                raise HTTPException(422, "Leftovers must be scheduled after cooking")
            slot["meal_id"] = None
        else:
            slot["meal_id"] = None
            slot["cooking_slot_id"] = None


def proposed(change, db):
    current = snapshot(db)
    if change.expected_version != current["version"]:
        raise HTTPException(409, "Planner changed. Reload and review again.")
    slots = {s["id"]: s for s in current["slots"]}
    if len({s.id for s in change.slots}) != len(change.slots):
        raise HTTPException(422, "Duplicate slot IDs")
    for slot_id in change.remove_ids:
        if slot_id not in slots:
            raise HTTPException(409, "Slot no longer exists. Reload and review.")
        del slots[slot_id]
    settings = current["settings"]
    for item in change.slots:
        if item.meal_type not in settings["enabled_types"]:
            raise HTTPException(422, "Meal type is not enabled")
        data = item.model_dump(mode="json")
        data["time"] = data["time"] or settings["times"][item.meal_type]
        data["duration"] = data["duration"] or settings["duration"]
        slots[item.id] = data
    validate_plan(slots, settings, db)
    return current, slots


def save_review(db, user, kind, payload, fingerprint):
    review = ReviewReceipt(
        user_id=user.id,
        token=str(uuid.uuid4()),
        kind=kind,
        payload=payload,
        fingerprint=fingerprint,
    )
    db.add(review)
    db.commit()
    return review.token


@router.get("")
def get_plan(
    week: date, user=Depends(get_current_user_read), db: Session = Depends(get_db)
):
    result = snapshot(db)
    start = week_start(week)
    result["week"] = str(start)
    # Include linked sessions/leftovers beyond this week for correct batch review.
    result["linked_slots"] = result["slots"]
    result["slots"] = [
        s
        for s in result["slots"]
        if str(start) <= s["day"] <= str(start + timedelta(days=6))
    ]
    db.commit()
    return result


@router.put("/settings")
async def set_settings(
    data: PlannerSettings,
    user=Depends(get_current_admin_jwt),
    db: Session = Depends(get_db),
):
    lock(db, data.expected_version)
    settings = data.model_dump(exclude={"expected_version"})
    validate_plan({s.id: slot_json(s) for s in db.query(PlannerSlot)}, settings, db)
    state(db).settings = settings
    queue_sync(db, [s.id for s in db.query(PlannerSlot)])
    db.commit()
    await manager.broadcast_to_list("shared", {"type": "planner_changed"})
    return snapshot(db)


@router.post("/preview")
def preview_plan(
    data: PlanChange,
    user=Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    current, slots = proposed(data, db)
    payload = data.model_dump(mode="json")
    token = save_review(db, user, "plan", payload, digest(current))
    return {
        "token": token,
        "slots": list(slots.values()),
        "changed_slots": [slots[item.id] for item in data.slots],
        "removed": [s for s in current["slots"] if s["id"] in data.remove_ids],
    }


@router.post("/commit")
async def commit_plan(
    data: ReviewCommit,
    user=Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    review = (
        db.query(ReviewReceipt)
        .filter_by(token=data.token, user_id=user.id, kind="plan")
        .first()
    )
    if not review:
        raise HTTPException(404, "Review not found")
    prior = (
        db.query(ReviewReceipt)
        .filter_by(user_id=user.id, request_id=data.request_id)
        .first()
    )
    if prior and prior.token != data.token:
        raise HTTPException(409, "request_id was already used for another review")
    if review.result:
        if review.result["request_id"] != data.request_id:
            raise HTTPException(409, "Review already applied")
        return review.result
    change = PlanChange(**review.payload)
    current, proposed_slots = proposed(change, db)
    if digest(current) != review.fingerprint:
        raise HTTPException(409, "Planner changed. Reload and review again.")
    try:
        lock(db, change.expected_version)
    except HTTPException:
        db.refresh(review)
        if review.result and review.result["request_id"] == data.request_id:
            return review.result
        raise
    # Delete moved rows first to avoid transient unique-position conflicts during swaps.
    changed_ids = set(change.remove_ids) | {s.id for s in change.slots}
    db.query(PlannerSlot).filter(PlannerSlot.id.in_(changed_ids)).delete(
        synchronize_session=False
    )
    db.flush()
    for item in change.slots:
        db.add(PlannerSlot(**proposed_slots[item.id]))
    queue_sync(db, changed_ids)
    result = {"version": change.expected_version + 1, "request_id": data.request_id}
    review.request_id = data.request_id
    review.result = result
    db.commit()
    await manager.broadcast_to_list("shared", {"type": "planner_changed"})
    return result


class Suggestions(BaseModel):
    week: date
    expected_version: int
    vegetarian: int = Field(0, ge=0, le=21)
    fish: int = Field(0, ge=0, le=21)
    avoid_weeks: int = Field(1, ge=0, le=52)


@router.post("/suggestions")
def suggestions(
    data: Suggestions,
    user=Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    current = snapshot(db)
    if data.expected_version != current["version"]:
        raise HTTPException(409, "Planner changed. Reload and review again.")
    start = week_start(data.week)
    end = str(start + timedelta(days=6))
    by_id = {s["id"]: s for s in current["slots"]}
    existing = [s for s in current["slots"] if str(start) <= s["day"] <= end]
    recipes = {m.id: m for m in db.query(Meal).filter_by(is_archived=False)}

    def recipe_id(s):
        return (
            by_id.get(s["cooking_slot_id"], {}).get("meal_id")
            if s["kind"] == "leftover"
            else s["meal_id"]
        )

    used = {recipe_id(s) for s in existing}
    recent = {
        recipe_id(s)
        for s in current["slots"]
        if str(start - timedelta(weeks=data.avoid_weeks)) <= s["day"] < str(start)
    }
    candidates = [
        m
        for m in recipes.values()
        if m.id not in used and (m.id not in recent or m.allow_weekly_repeat)
    ]
    counts = {
        tag: sum(
            tag in [t.casefold() for t in recipes[recipe_id(s)].tags]
            for s in existing
            if recipe_id(s) in recipes
        )
        for tag in ("vegetarian", "fish")
    }
    requested = {"vegetarian": data.vegetarian, "fish": data.fish}
    occupied = {(s["day"], s["meal_type"]) for s in existing}
    slots = []
    for offset in range(7):
        for meal_type in current["settings"]["enabled_types"]:
            day = str(start + timedelta(days=offset))
            if (day, meal_type) in occupied:
                continue
            needed = [tag for tag in counts if counts[tag] < requested[tag]]
            pool = (
                [
                    m
                    for m in candidates
                    if any(tag in [t.casefold() for t in m.tags] for tag in needed)
                ]
                if needed
                else candidates
            )
            if not pool:
                pool = candidates
            if not pool:
                continue
            meal = random.choices(
                pool,
                weights=[
                    sum(r.value for r in m.ratings) / len(m.ratings) if m.ratings else 3
                    for m in pool
                ],
            )[0]
            candidates.remove(meal)
            for tag in counts:
                counts[tag] += tag in [t.casefold() for t in meal.tags]
            slots.append(
                SlotInput(
                    day=day,
                    meal_type=meal_type,
                    meal_id=meal.id,
                    servings=meal.base_servings,
                )
            )
    change = PlanChange(expected_version=data.expected_version, slots=slots)
    preview = preview_plan(change, user, db)
    preview["unmet"] = {
        tag: requested[tag] - counts[tag]
        for tag in counts
        if requested[tag] > counts[tag]
    }
    preview["unfilled"] = (
        7 * len(current["settings"]["enabled_types"]) - len(existing) - len(slots)
    )
    return preview


@pantry_router.get("")
def get_pantry(user=Depends(get_current_user_read), db: Session = Depends(get_db)):
    return {
        "ingredient_ids": [p.ingredient_id for p in db.query(PantryStaple)],
        "version": state(db).version,
    }


class PantryChange(BaseModel):
    expected_version: int
    usually_have: bool


@pantry_router.put("/{ingredient_id}")
async def set_pantry(
    ingredient_id: str,
    data: PantryChange,
    user=Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    ingredient = db.get(Ingredient, ingredient_id)
    if not ingredient or ingredient.is_archived:
        raise HTTPException(404, "Ingredient not found")
    lock(db, data.expected_version)
    existing = db.get(PantryStaple, ingredient_id)
    if data.usually_have and not existing:
        db.add(PantryStaple(ingredient_id=ingredient_id))
    elif existing and not data.usually_have:
        db.delete(existing)
    db.commit()
    await manager.broadcast_to_list("shared", {"type": "pantry_changed"})
    return get_pantry(user, db)


class GroceryPreview(BaseModel):
    week: date
    list_id: str
    include_staples: list[str] = Field(default_factory=list)
    exclude_keys: list[str] = Field(default_factory=list)


def grocery_requirements(data, db):
    start = week_start(data.week)
    slots = [slot_json(s) for s in db.query(PlannerSlot)]
    pantry = {p.ingredient_id for p in db.query(PantryStaple)}
    output = {}
    excluded = {}
    for slot in slots:
        if slot["kind"] != "recipe" or not str(start) <= slot["day"] <= str(
            start + timedelta(days=6)
        ):
            continue
        meal = db.get(Meal, slot["meal_id"])
        portions = slot["servings"] + sum(
            s["servings"]
            for s in slots
            if s["kind"] == "leftover" and s["cooking_slot_id"] == slot["id"]
        )
        for row in meal.ingredients:
            amount, unit = canonical(
                scaled(
                    row.quantity,
                    portions / meal.base_servings,
                    row.scales_with_servings,
                ),
                row.unit,
            )
            key = digest([row.ingredient_id, unit, amount is None])
            target = (
                excluded
                if row.ingredient_id in pantry
                and row.ingredient_id not in data.include_staples
                else output
            )
            if key not in target:
                target[key] = {
                    "key": key,
                    "ingredient_id": row.ingredient_id,
                    "name": row.ingredient.name,
                    "unit": unit,
                    "quantity": 0 if amount is not None else None,
                    "category_id": row.category_id
                    or row.ingredient.default_category_id,
                    "sources": [],
                }
            if amount is not None:
                target[key]["quantity"] = round(target[key]["quantity"] + amount, 6)
            target[key]["sources"].append(
                {
                    "slot_id": slot["id"],
                    "recipe": meal.name,
                    "servings": portions,
                    "quantity": amount,
                    "wording": f'{row.quantity if row.quantity is not None else ""} {row.unit} {row.ingredient.name}'.strip(),
                    "notes": row.notes,
                }
            )
    for row in excluded.values():
        row["exclusion_reason"] = "usually_have"
    for key in data.exclude_keys:
        if key in output:
            excluded[key] = {**output.pop(key), "exclusion_reason": "already_have"}
    return output, list(excluded.values())


def grocery_snapshot(data, db):
    required, excluded = grocery_requirements(data, db)
    contributions = (
        db.query(GroceryContribution)
        .filter_by(list_id=data.list_id, week=str(week_start(data.week)))
        .all()
    )
    items = db.query(ListItem).filter_by(list_id=data.list_id).all()
    fingerprint = digest(
        {
            "planner": snapshot(db),
            "required": required,
            "excluded": excluded,
            "contributions": [
                (c.id, c.requirement, c.item_id, c.progress) for c in contributions
            ],
            "items": [
                (
                    i.id,
                    i.quantity,
                    i.unit,
                    i.name,
                    i.checked,
                    i.already_have,
                    i.updated_at,
                )
                for i in items
            ],
        }
    )
    old = {c.key: c for c in contributions}
    changes = []
    for key in sorted(set(required) | set(old)):
        before = old[key].requirement if key in old else None
        after = required.get(key)
        if before == after:
            continue
        item = (
            db.get(ListItem, old[key].item_id)
            if key in old and old[key].item_id
            else None
        )
        manually_changed = bool(item and before and not tracked_identity(item, before))
        if manually_changed:
            item = None
        progress = progress_for(old.get(key), item)
        bought = progress["purchased"]
        changes.append(
            {
                "key": key,
                "before": before,
                "after": after,
                "action": (
                    "add" if before is None else "remove" if after is None else "update"
                ),
                "manual_item_retained": manually_changed,
                "purchased_quantity": bought,
                "preserve_completed": bool(progress["completed_ids"]),
                "extra_required": (
                    max(0, (after["quantity"] or 0) - progress["fulfilled"])
                    if after and progress["completed_ids"]
                    else None
                ),
            }
        )
    return required, excluded, changes, fingerprint


@router.post("/shopping/preview")
def preview_groceries(
    data: GroceryPreview,
    user=Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    check_list_access(data.list_id, user.id, db, require_edit=True)
    required, excluded, changes, fingerprint = grocery_snapshot(data, db)
    token = save_review(
        db, user, "groceries", data.model_dump(mode="json"), fingerprint
    )
    return {
        "token": token,
        "changes": changes,
        "requirements": list(required.values()),
        "excluded_staples": [row for row in excluded if row["exclusion_reason"] == "usually_have"],
        "excluded_items": excluded,
    }


@router.post("/shopping/commit")
async def commit_groceries(
    data: ReviewCommit,
    user=Depends(get_current_user_write),
    db: Session = Depends(get_db),
):
    review = (
        db.query(ReviewReceipt)
        .filter_by(token=data.token, user_id=user.id, kind="groceries")
        .first()
    )
    if not review:
        raise HTTPException(404, "Review not found")
    request = GroceryPreview(**review.payload)
    check_list_access(request.list_id, user.id, db, require_edit=True)
    prior = (
        db.query(ReviewReceipt)
        .filter_by(user_id=user.id, request_id=data.request_id)
        .first()
    )
    if prior and prior.token != data.token:
        raise HTTPException(409, "request_id was already used for another review")
    if review.result:
        if review.result["request_id"] != data.request_id:
            raise HTTPException(409, "Review already applied")
        return review.result
    # Serialise commits with all planner/pantry writes before taking the final snapshot.
    version = state(db).version
    lock(db, version)
    state(db).version = version
    db.flush()
    db.refresh(review)
    if review.result:
        if review.result["request_id"] == data.request_id:
            db.rollback()
            return review.result
        raise HTTPException(409, "Review already applied")
    required, excluded, changes, fingerprint = grocery_snapshot(request, db)
    if fingerprint != review.fingerprint:
        db.rollback()
        raise HTTPException(
            409, "Plan, recipe or shopping list changed. Reload and review again."
        )
    for change in changes:
        old = (
            db.query(GroceryContribution)
            .filter_by(
                list_id=request.list_id,
                week=str(week_start(request.week)),
                key=change["key"],
            )
            .first()
        )
        item = db.get(ListItem, old.item_id) if old and old.item_id else None
        before, after = change["before"], change["after"]
        if item and before and not tracked_identity(item, before):
            item = None
        old_qty = (before or {}).get("quantity")
        new_qty = (after or {}).get("quantity")
        progress = progress_for(old, item)
        needed = (
            max(0, (new_qty or 0) - progress["fulfilled"])
            if new_qty is not None
            else None
        )
        if item and not item.checked:
            if item.quantity is not None and progress["managed"] is not None:
                extras = max(0, item.quantity - progress["managed"])
                item.quantity = extras + (needed or 0)
                if item.quantity == 0:
                    db.delete(item)
                    item = None
            elif not after:
                item.notes = (
                    (item.notes or "")
                    + "\nPlan no longer requires this unquantified ingredient; review manually."
                )
        elif after and (
            needed is None
            and not progress["completed_ids"]
            or needed is not None
            and needed > 0
        ):
            item = ListItem(
                list_id=request.list_id,
                name=after["name"],
                quantity=needed,
                unit=after["unit"],
                category_id=after["category_id"],
                added_by=user.id,
                notes=(
                    "Extra required after completion.\n"
                    if progress["completed_ids"]
                    else ""
                )
                + "\n".join(
                    f"{s['recipe']}: {s['wording']} {s['notes']}"
                    for s in after["sources"]
                ),
            )
            db.add(item)
            db.flush()
        progress["managed"] = needed
        if after:
            if not old:
                old = GroceryContribution(
                    list_id=request.list_id,
                    week=str(week_start(request.week)),
                    key=change["key"],
                )
                db.add(old)
            old.progress = progress
            old.requirement = after
            old.item_id = item.id if item else None
        elif old:
            db.delete(old)
    review.request_id = data.request_id
    review.result = {"request_id": data.request_id, "changed": len(changes)}
    db.commit()
    # Only the destination's authorised subscribers receive list invalidation.
    await manager.broadcast_to_list(
        request.list_id, {"type": "list_updated", "list_id": request.list_id}
    )
    return review.result


def progress_for(contribution, item):
    progress = dict(contribution.progress or {}) if contribution else {}
    progress.setdefault("fulfilled", 0)
    progress.setdefault("purchased", 0)
    progress.setdefault(
        "managed", contribution.requirement["quantity"] if contribution else 0
    )
    progress["completed_ids"] = list(progress.get("completed_ids", []))
    if item and item.checked and item.id not in progress["completed_ids"]:
        progress["completed_ids"].append(item.id)
        progress["fulfilled"] += item.quantity or 0
        if not item.already_have:
            progress["purchased"] += item.quantity or 0
    return progress


def retain_completed(db, items):
    """Clearing completed rows must not erase completed planner quantities."""
    for item in items:
        for contribution in db.query(GroceryContribution).filter_by(item_id=item.id):
            contribution.progress = progress_for(contribution, item)
            contribution.item_id = None


def tracked_identity(item, requirement):
    return (
        " ".join(item.name.casefold().split())
        == " ".join(requirement["name"].casefold().split())
        and item.unit.strip().casefold() == requirement["unit"].strip().casefold()
    )
