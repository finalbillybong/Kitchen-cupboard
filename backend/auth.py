import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models import User, ApiKey, utcnow

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def generate_api_key() -> str:
    return "kc_" + secrets.token_urlsafe(32)


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _get_user_from_jwt(token: str, db: Session) -> Optional[User]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
        user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
        return user
    except JWTError:
        return None


def _get_user_from_api_key(token: str, db: Session) -> Optional[tuple[User, ApiKey]]:
    key_hash = hash_api_key(token)
    api_key = db.query(ApiKey).filter(
        ApiKey.key_hash == key_hash, ApiKey.is_active == True
    ).first()
    if api_key is None:
        return None
    user = db.query(User).filter(User.id == api_key.user_id, User.is_active == True).first()
    if user is None:
        return None
    api_key.last_used = utcnow()
    db.commit()
    return user, api_key


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # Try JWT first
    user = _get_user_from_jwt(token, db)
    if user:
        return user

    # Try API key
    result = _get_user_from_api_key(token, db)
    if result:
        return result[0]

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
        )
    return user


def get_current_user_jwt(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """JWT-only authentication. Rejects API keys.
    Use this for sensitive endpoints (user management, API key creation, etc.)."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = _get_user_from_jwt(credentials.credentials, db)
    if user:
        return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="This endpoint requires login authentication (API keys not accepted)",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_admin_jwt(user: User = Depends(get_current_user_jwt)) -> User:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
        )
    return user
