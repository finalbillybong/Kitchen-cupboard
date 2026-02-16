import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = os.environ.get(
        "DATABASE_URL", "sqlite:///./data/kitchen_cupboard.db"
    )
    SECRET_KEY: str = os.environ.get(
        "SECRET_KEY", "change-me-in-production-use-a-long-random-string"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    REGISTRATION_ENABLED: bool = os.environ.get("REGISTRATION_ENABLED", "true").lower() == "true"
    APP_NAME: str = "Kitchen Cupboard"
    APP_VERSION: str = "1.0.0"


settings = Settings()
