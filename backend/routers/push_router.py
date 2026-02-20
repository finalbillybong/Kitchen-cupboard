from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, PushSubscription, NotificationPreference
from schemas import (
    PushSubscriptionCreate,
    NotificationPreferenceOut,
    NotificationPreferenceUpdate,
)
from vapid_keys import get_vapid_keys

router = APIRouter(prefix="/api/push", tags=["Push Notifications"])


# ─── VAPID Public Key ─────────────────────────────────────────────

@router.get("/vapid-key")
def get_vapid_public_key():
    """Return the VAPID public key for the browser to use when subscribing."""
    _, public_key = get_vapid_keys()
    return {"public_key": public_key}


# ─── Subscriptions ────────────────────────────────────────────────

@router.post("/subscribe", status_code=201)
def subscribe(
    data: PushSubscriptionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Register a push subscription for the current user/device."""
    # Upsert: update keys if endpoint already exists for this user
    existing = db.query(PushSubscription).filter(
        PushSubscription.user_id == user.id,
        PushSubscription.endpoint == data.endpoint,
    ).first()

    if existing:
        existing.key_p256dh = data.keys.p256dh
        existing.key_auth = data.keys.auth
        db.commit()
        return {"ok": True, "updated": True}

    sub = PushSubscription(
        user_id=user.id,
        endpoint=data.endpoint,
        key_p256dh=data.keys.p256dh,
        key_auth=data.keys.auth,
    )
    db.add(sub)
    db.commit()
    return {"ok": True, "created": True}


@router.delete("/subscribe")
def unsubscribe(
    data: PushSubscriptionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a push subscription."""
    deleted = db.query(PushSubscription).filter(
        PushSubscription.user_id == user.id,
        PushSubscription.endpoint == data.endpoint,
    ).delete(synchronize_session=False)
    db.commit()
    if not deleted:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {"ok": True}


# ─── Notification Preferences ─────────────────────────────────────

@router.get("/settings", response_model=NotificationPreferenceOut)
def get_notification_settings(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's notification preferences."""
    pref = db.query(NotificationPreference).filter(
        NotificationPreference.user_id == user.id
    ).first()

    if not pref:
        # Return defaults
        return NotificationPreferenceOut(
            push_enabled=True,
            notify_item_added=True,
            notify_item_checked=True,
            notify_item_updated=False,
            notify_item_removed=False,
            notify_list_shared=True,
            notify_checked_cleared=False,
        )

    return pref


@router.put("/settings", response_model=NotificationPreferenceOut)
def update_notification_settings(
    data: NotificationPreferenceUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's notification preferences."""
    pref = db.query(NotificationPreference).filter(
        NotificationPreference.user_id == user.id
    ).first()

    if not pref:
        pref = NotificationPreference(user_id=user.id)
        db.add(pref)

    if data.push_enabled is not None:
        pref.push_enabled = data.push_enabled
    if data.notify_item_added is not None:
        pref.notify_item_added = data.notify_item_added
    if data.notify_item_checked is not None:
        pref.notify_item_checked = data.notify_item_checked
    if data.notify_item_updated is not None:
        pref.notify_item_updated = data.notify_item_updated
    if data.notify_item_removed is not None:
        pref.notify_item_removed = data.notify_item_removed
    if data.notify_list_shared is not None:
        pref.notify_list_shared = data.notify_list_shared
    if data.notify_checked_cleared is not None:
        pref.notify_checked_cleared = data.notify_checked_cleared

    db.commit()
    db.refresh(pref)
    return pref
