import os
import secrets
import sys

from pydantic_settings import BaseSettings

_INSECURE_DEFAULTS = {
    "change-me-in-production",
    "change-me-in-production-use-a-long-random-string",
    "secret",
    "password",
}


class Settings(BaseSettings):
    DATABASE_URL: str = os.environ.get(
        "DATABASE_URL", "sqlite:///./data/kitchen_cupboard.db"
    )
    SECRET_KEY: str = os.environ.get(
        "SECRET_KEY", ""
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    REGISTRATION_ENABLED: bool = os.environ.get("REGISTRATION_ENABLED", "false").lower() == "true"
    LOGIN_RATE_LIMIT_WINDOW: int = 300  # seconds
    LOGIN_RATE_LIMIT_MAX: int = 10  # max attempts per window per IP
    APP_NAME: str = "Kitchen Cupboard"
    APP_VERSION: str = "1.0.0"


settings = Settings()

# Refuse to start with insecure or missing SECRET_KEY
if not settings.SECRET_KEY or settings.SECRET_KEY.lower() in _INSECURE_DEFAULTS:
    print("=" * 60, file=sys.stderr)
    print("FATAL: SECRET_KEY is not set or uses an insecure default.", file=sys.stderr)
    print("Generate a secure key with:", file=sys.stderr)
    print(f'  python -c "import secrets; print(secrets.token_urlsafe(64))"', file=sys.stderr)
    print("Then set it as the SECRET_KEY environment variable.", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    sys.exit(1)
