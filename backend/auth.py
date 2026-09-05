import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt.exceptions import PyJWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models import User, ApiKey, utcnow

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(
    auto_error=False,
    bearerFormat="JWT or kc_ API key",
    description=(
        "Use the JWT returned by /api/auth/login for the web application, or "
        "send a full kc_ API key directly. API keys are not exchanged at the login endpoint."
    ),
)


@dataclass
class AuthPrincipal:
    """The user and credential type resolved from a Bearer token."""

    user: User
    method: str
    api_key: Optional[ApiKey] = None


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


def create_refresh_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {"sub": user_id, "type": "refresh", "exp": expire}
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
        # Reject refresh tokens used as access tokens
        if payload.get("type") == "refresh":
            return None
        user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
        return user
    except PyJWTError:
        return None


def verify_refresh_token(token: str) -> Optional[str]:
    """Verify a refresh token and return the user_id if valid."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload.get("sub")
    except PyJWTError:
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
    return user, api_key


def resolve_token(token: str, db: Session) -> Optional[AuthPrincipal]:
    """Resolve a JWT or API key without applying endpoint-specific authorization."""
    user = _get_user_from_jwt(token, db)
    if user:
        return AuthPrincipal(user=user, method="jwt")

    result = _get_user_from_api_key(token, db)
    if result:
        user, api_key = result
        return AuthPrincipal(user=user, method="api_key", api_key=api_key)
    return None


def api_key_has_scope(principal: AuthPrincipal, required_scope: str) -> bool:
    """JWTs have every user scope; API keys have their explicitly stored scopes."""
    if principal.method == "jwt":
        return True
    scopes = {scope.strip() for scope in (principal.api_key.scopes or "").split(",")}
    return required_scope in scopes


def record_api_key_use(principal: AuthPrincipal, db: Session) -> None:
    """Persist API-key usage independently of whether the route mutates data."""
    if principal.api_key is None:
        return
    db.query(ApiKey).filter(ApiKey.id == principal.api_key.id).update(
        {ApiKey.last_used: utcnow()}, synchronize_session=False
    )
    db.commit()


def _get_user_with_scope(
    credentials: Optional[HTTPAuthorizationCredentials],
    db: Session,
    required_scope: str,
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    principal = resolve_token(token, db)
    if principal:
        if not api_key_has_scope(principal, required_scope):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key missing required scope: {required_scope}",
            )
        record_api_key_use(principal, db)
        return principal.user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user_read(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Auth that accepts API keys with at least 'read' scope."""
    return _get_user_with_scope(credentials, db, required_scope="read")


def get_current_user_write(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Auth that requires 'write' scope for API keys."""
    return _get_user_with_scope(credentials, db, required_scope="write")


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
