"""VAPID key management for Web Push notifications.

Auto-generates ECDSA key pair on first startup and persists to data directory.
"""

import base64
import json
import os

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

from config import settings

KEYS_FILE = os.path.join("data", "vapid_keys.json")


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _generate_vapid_keys() -> tuple[str, str]:
    """Generate a new VAPID key pair. Returns (private_b64url, public_b64url)."""
    private_key = ec.generate_private_key(ec.SECP256R1())

    # Raw private key (32 bytes)
    private_numbers = private_key.private_numbers()
    private_bytes = private_numbers.private_value.to_bytes(32, "big")
    private_b64 = _b64url_encode(private_bytes)

    # Uncompressed public key (65 bytes: 0x04 + x + y)
    public_key = private_key.public_key()
    public_bytes = public_key.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    public_b64 = _b64url_encode(public_bytes)

    return private_b64, public_b64


def get_vapid_keys() -> tuple[str, str]:
    """Get VAPID keys, generating them if necessary.

    Returns (private_key_b64url, public_key_b64url).
    Priority:
    1. Environment variables (VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY)
    2. Persisted keys in data/vapid_keys.json
    3. Auto-generate and persist new keys
    """
    # 1. From config / env vars
    if settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY:
        return settings.VAPID_PRIVATE_KEY, settings.VAPID_PUBLIC_KEY

    # 2. From persisted file
    if os.path.exists(KEYS_FILE):
        with open(KEYS_FILE) as f:
            keys = json.load(f)
        return keys["private_key"], keys["public_key"]

    # 3. Generate and persist
    private_key, public_key = _generate_vapid_keys()
    os.makedirs("data", exist_ok=True)
    with open(KEYS_FILE, "w") as f:
        json.dump({"private_key": private_key, "public_key": public_key}, f)
    os.chmod(KEYS_FILE, 0o600)

    return private_key, public_key
