import sys

from pydantic_settings import BaseSettings

_INSECURE_DEFAULTS = {
    "change-me-in-production",
    "change-me-in-production-use-a-long-random-string",
    "secret",
    "password",
}


class Settings(BaseSettings):
    # Pydantic-settings reads these automatically from environment variables.
    # Defaults are only used when the env var is absent.
    DATABASE_URL: str = "sqlite:///./data/kitchen_cupboard.db"
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    REGISTRATION_ENABLED: bool = False
    LOGIN_RATE_LIMIT_WINDOW: int = 300
    LOGIN_RATE_LIMIT_MAX: int = 10
    REGISTER_RATE_LIMIT_WINDOW: int = 3600
    REGISTER_RATE_LIMIT_MAX: int = 5
    APP_NAME: str = "Kitchen Cupboard"
    APP_VERSION: str = "1.0.0"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

if not settings.SECRET_KEY or settings.SECRET_KEY.lower() in _INSECURE_DEFAULTS:
    print("=" * 60, file=sys.stderr)
    print("FATAL: SECRET_KEY is not set or uses an insecure default.", file=sys.stderr)
    print("Generate a secure key with:", file=sys.stderr)
    print('  python -c "import secrets; print(secrets.token_urlsafe(64))"', file=sys.stderr)
    print("Then set it as the SECRET_KEY environment variable.", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    sys.exit(1)
