from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import User
from ..schemas import LoginIn
from ..security import check_throttle, clear_failures, create_access_token, current_user, record_failure, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
def user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "institution_id": u.institution_id, "region_code": u.region_code, "is_active": u.is_active}

@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    check_throttle(body.email)
    user = db.scalar(select(User).where(User.email == body.email))
    if not verify_password(body.password, user.password_hash if user else None) or not user.is_active:
        record_failure(body.email); raise HTTPException(401, "Invalid email or password")   # same message for unknown user, wrong password, inactive
    clear_failures(body.email)
    return {"access_token": create_access_token(user.id), "token_type": "bearer", "user": user_out(user)}


@router.post("/demo-login")
def demo_login(body: dict, db: Session = Depends(get_db)):
    """One-click demo access for local development only; never enabled in production."""
    from ..config import get_settings
    if get_settings().env == "production":
        raise HTTPException(404, "Demo access is unavailable.")
    role = body.get("role")
    demo_accounts = {
        "admin": "admin-0@nexus-demo.invalid",
        "regional": "regional-0@nexus-demo.invalid",
        "scrutiny": "scrutiny-0@nexus-demo.invalid",
        "institution": "institution-0@nexus-demo.invalid",
        "evc": "evc-0@nexus-demo.invalid",
    }
    email = demo_accounts.get(role)
    if not email:
        raise HTTPException(422, "Choose a valid demo role.")
    user = db.scalar(select(User).where(User.email == email))
    if not user or not user.is_active:
        raise HTTPException(503, "Demo accounts are not initialized. Run the documented local database setup and demo seed commands.")
    return {"access_token": create_access_token(user.id), "token_type": "bearer", "user": user_out(user)}

@router.get("/me")
def me(user: User = Depends(current_user)): return user_out(user)   # role always comes from the database

@router.post("/logout")
def logout(_: User = Depends(current_user)): return {"ok": True}   # tokens are stateless and short-lived; the client discards its token
