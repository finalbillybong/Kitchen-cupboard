import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    get_current_admin,
    generate_api_key,
    hash_api_key,
)
from config import settings
from database import get_db
from models import User, ApiKey, InviteCode
from rate_limit import login_limiter
from schemas import (
    UserCreate,
    UserLogin,
    UserOut,
    UserUpdate,
    Token,
    PasswordChange,
    ApiKeyCreate,
    ApiKeyOut,
    ApiKeyCreated,
    InviteCodeOut,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=Token, status_code=201)
def register(data: UserCreate, db: Session = Depends(get_db)):
    # Check if this is the first user (auto-admin)
    user_count = db.query(User).count()
    is_first_user = user_count == 0

    if not is_first_user and not settings.REGISTRATION_ENABLED:
        # Check invite code
        if not data.invite_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Registration requires an invite code",
            )
        invite = db.query(InviteCode).filter(
            InviteCode.code == data.invite_code,
            InviteCode.is_used == False,
        ).first()
        if not invite:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or used invite code",
            )
        if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invite code has expired",
            )

    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        display_name=data.display_name or data.username,
        is_admin=is_first_user,
    )
    db.add(user)

    # Mark invite code as used
    if not is_first_user and not settings.REGISTRATION_ENABLED and data.invite_code:
        invite = db.query(InviteCode).filter(InviteCode.code == data.invite_code).first()
        if invite:
            invite.is_used = True
            invite.used_by = user.id

    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.id})
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
def login(data: UserLogin, request: Request, db: Session = Depends(get_db)):
    # Rate limit by client IP
    client_ip = request.client.host if request.client else "unknown"
    if login_limiter.is_rate_limited(client_ip):
        remaining = login_limiter.remaining_seconds(client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {remaining} seconds.",
            headers={"Retry-After": str(remaining)},
        )

    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.password_hash):
        login_limiter.record_attempt(client_ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    token = create_access_token({"sub": user.id})
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


@router.put("/me", response_model=UserOut)
def update_me(
    data: UserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.display_name is not None:
        user.display_name = data.display_name
    if data.email is not None:
        existing = db.query(User).filter(User.email == data.email, User.id != user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = data.email
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/change-password")
def change_password(
    data: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"message": "Password changed successfully"}


# ─── API Keys ───────────────────────────────────────────────────────

@router.post("/api-keys", response_model=ApiKeyCreated, status_code=201)
def create_api_key(
    data: ApiKeyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    raw_key = generate_api_key()
    api_key = ApiKey(
        user_id=user.id,
        key_hash=hash_api_key(raw_key),
        key_prefix=raw_key[:11],
        name=data.name,
        scopes=data.scopes,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)
    result = ApiKeyCreated.model_validate(api_key)
    result.key = raw_key
    return result


@router.get("/api-keys", response_model=list[ApiKeyOut])
def list_api_keys(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    keys = db.query(ApiKey).filter(ApiKey.user_id == user.id).all()
    return [ApiKeyOut.model_validate(k) for k in keys]


@router.delete("/api-keys/{key_id}", status_code=204)
def delete_api_key(
    key_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    db.delete(key)
    db.commit()


# ─── Invite Codes (admin only) ─────────────────────────────────────

@router.post("/invite-codes", response_model=InviteCodeOut, status_code=201)
def create_invite_code(
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    code = secrets.token_urlsafe(8)
    invite = InviteCode(
        code=code,
        created_by=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return InviteCodeOut.model_validate(invite)


@router.get("/invite-codes", response_model=list[InviteCodeOut])
def list_invite_codes(
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    codes = db.query(InviteCode).filter(InviteCode.created_by == user.id).order_by(
        InviteCode.created_at.desc()
    ).all()
    return [InviteCodeOut.model_validate(c) for c in codes]


# ─── Admin: User Management ────────────────────────────────────────

@router.get("/users", response_model=list[UserOut])
def list_users(
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    users = db.query(User).order_by(User.created_at).all()
    return [UserOut.model_validate(u) for u in users]


@router.put("/users/{user_id}/toggle-active", response_model=UserOut)
def toggle_user_active(
    user_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    target.is_active = not target.is_active
    db.commit()
    db.refresh(target)
    return UserOut.model_validate(target)
