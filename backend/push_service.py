"""Web Push notification service.

Sends push notifications to users who have subscriptions registered
and the relevant notification preference enabled.
"""

import json
import logging

from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session

from config import settings
from models import (
    PushSubscription,
    NotificationPreference,
    ShoppingList,
    ListMember,
    User,
)
from vapid_keys import get_vapid_keys

logger = logging.getLogger(__name__)

# Map WebSocket event types to notification preference field names
EVENT_TO_PREF = {
    "item_added": "notify_item_added",
    "item_checked": "notify_item_checked",
    "item_updated": "notify_item_updated",
    "item_removed": "notify_item_removed",
    "checked_cleared": "notify_checked_cleared",
    "list_shared": "notify_list_shared",
}

# Human-readable titles for each event
EVENT_TITLES = {
    "item_added": "Item added",
    "item_checked": "Item checked off",
    "item_updated": "Item updated",
    "item_removed": "Item removed",
    "checked_cleared": "Checked items cleared",
    "list_shared": "List shared with you",
}


def _build_notification_body(
    event_type: str, username: str, data: dict, list_name: str
) -> dict:
    """Build the push notification payload with deep link URL."""
    title = f"{settings.APP_NAME}"
    item_name = data.get("name", "")
    list_id = data.get("list_id", "")

    if event_type == "item_added":
        body = f"{username} added \"{item_name}\" to {list_name}"
    elif event_type == "item_checked":
        body = f"{username} checked off \"{item_name}\" in {list_name}"
    elif event_type == "item_updated":
        body = f"{username} updated \"{item_name}\" in {list_name}"
    elif event_type == "item_removed":
        body = f"{username} removed an item from {list_name}"
    elif event_type == "checked_cleared":
        count = data.get("deleted_count", 0)
        body = f"{username} cleared {count} checked item{'s' if count != 1 else ''} from {list_name}"
    elif event_type == "list_shared":
        body = f"{username} shared \"{list_name}\" with you"
    else:
        body = f"{username} updated {list_name}"

    return {
        "title": title,
        "body": body,
        "tag": f"{event_type}:{list_id}",
        "data": {
            "url": f"/list/{list_id}",
            "list_id": list_id,
            "event_type": event_type,
        },
    }


def _get_list_members(list_id: str, db: Session) -> list[str]:
    """Get all user IDs that have access to a list (owner + members)."""
    lst = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if not lst:
        return []

    user_ids = [lst.owner_id]
    members = db.query(ListMember.user_id).filter(
        ListMember.list_id == list_id
    ).all()
    user_ids.extend(m.user_id for m in members)
    return user_ids


def _should_notify(user_id: str, event_type: str, db: Session) -> bool:
    """Check if a user wants notifications for this event type."""
    pref_field = EVENT_TO_PREF.get(event_type)
    if not pref_field:
        return False

    pref = db.query(NotificationPreference).filter(
        NotificationPreference.user_id == user_id
    ).first()

    # Default: enabled for item_added, item_checked, list_shared
    if not pref:
        return event_type in ("item_added", "item_checked", "list_shared")

    if not pref.push_enabled:
        return False

    return getattr(pref, pref_field, False)


def send_push_for_list_event(
    list_id: str,
    event_type: str,
    data: dict,
    acting_user: User,
    db: Session,
):
    """Send push notifications to all list members (except the acting user)
    who have push enabled and the relevant preference turned on."""
    try:
        private_key, _ = get_vapid_keys()
    except Exception:
        logger.warning("VAPID keys not available, skipping push notifications")
        return

    # Get list name for the notification body
    lst = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    list_name = lst.name if lst else "a list"

    username = acting_user.display_name or acting_user.username
    member_ids = _get_list_members(list_id, db)

    # Ensure data has list_id for deep linking
    notification_data = dict(data)
    notification_data["list_id"] = list_id

    payload = _build_notification_body(event_type, username, notification_data, list_name)
    payload_json = json.dumps(payload)

    dead_subs = []

    for user_id in member_ids:
        # Don't notify the person who performed the action
        if user_id == acting_user.id:
            continue

        if not _should_notify(user_id, event_type, db):
            continue

        subs = db.query(PushSubscription).filter(
            PushSubscription.user_id == user_id
        ).all()

        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {
                            "p256dh": sub.key_p256dh,
                            "auth": sub.key_auth,
                        },
                    },
                    data=payload_json,
                    vapid_private_key=private_key,
                    vapid_claims={"sub": settings.VAPID_CLAIMS_EMAIL},
                )
            except WebPushException as e:
                # 404 or 410 means the subscription is expired/invalid
                if e.response and e.response.status_code in (404, 410):
                    dead_subs.append(sub.id)
                else:
                    logger.warning("Push failed for sub %s: %s", sub.id, e)
            except Exception as e:
                logger.warning("Push failed for sub %s: %s", sub.id, e)

    # Clean up expired subscriptions
    if dead_subs:
        db.query(PushSubscription).filter(
            PushSubscription.id.in_(dead_subs)
        ).delete(synchronize_session=False)
        db.commit()


def send_push_for_list_shared(
    list_id: str,
    list_name: str,
    target_user_id: str,
    acting_user: User,
    db: Session,
):
    """Send a push notification when a list is shared with a user."""
    try:
        private_key, _ = get_vapid_keys()
    except Exception:
        logger.warning("VAPID keys not available, skipping push notifications")
        return

    if not _should_notify(target_user_id, "list_shared", db):
        return

    username = acting_user.display_name or acting_user.username
    payload = _build_notification_body(
        "list_shared",
        username,
        {"list_id": list_id, "name": list_name},
        list_name,
    )
    payload_json = json.dumps(payload)

    subs = db.query(PushSubscription).filter(
        PushSubscription.user_id == target_user_id
    ).all()

    dead_subs = []
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.key_p256dh,
                        "auth": sub.key_auth,
                    },
                },
                data=payload_json,
                vapid_private_key=private_key,
                vapid_claims={"sub": settings.VAPID_CLAIMS_EMAIL},
            )
        except WebPushException as e:
            if e.response and e.response.status_code in (404, 410):
                dead_subs.append(sub.id)
            else:
                logger.warning("Push failed for sub %s: %s", sub.id, e)
        except Exception as e:
            logger.warning("Push failed for sub %s: %s", sub.id, e)

    if dead_subs:
        db.query(PushSubscription).filter(
            PushSubscription.id.in_(dead_subs)
        ).delete(synchronize_session=False)
        db.commit()
