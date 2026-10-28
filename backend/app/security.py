"""Backend-managed authentication. Passwords are bcrypt-hashed; tokens are signed JWTs holding ONLY the user id.
The role is read from the database on every request, never from the token or the browser."""
import time
from datetime import datetime, timedelta, timezone
import bcrypt, jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .config import get_settings
from .db import get_db
from .models import User

MAX_PASSWORD_BYTES = 72   # bcrypt limit
def hash_password(password: str) -> str:
    if len(password.encode()) > MAX_PASSWORD_BYTES: raise ValueError("password too long (max 72 bytes)")
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(get_settings().bcrypt_rounds)).decode()
_DUMMY = bcrypt.hashpw(b"timing-equalizer", bcrypt.gensalt(4)).decode()
def verify_password(password: str, hashed: str | None) -> bool:
    try: return bcrypt.checkpw(password.encode(), (hashed or _DUMMY).encode()) and hashed is not None
    except ValueError: return False

def create_access_token(user_id: str) -> str:
    s = get_settings(); n = datetime.now(timezone.utc)
    return jwt.encode({"sub": user_id, "iat": n, "exp": n + timedelta(minutes=s.token_minutes)}, s.secret_key, algorithm="HS256")

def create_document_download_token(user_id: str, application_id: str, document_id: str) -> str:
    """Issue a short-lived, document-scoped capability for native browser downloads."""
    now = datetime.now(timezone.utc)
    claims = {"sub": user_id, "app": application_id, "doc": document_id, "scope": "document-download",
              "iat": now, "exp": now + timedelta(minutes=2)}
    return jwt.encode(claims, get_settings().secret_key, algorithm="HS256")

def decode_document_download_token(token: str) -> dict:
    try:
        claims = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"],
                            options={"require": ["exp", "sub", "app", "doc", "scope"]})
    except jwt.PyJWTError:
        raise HTTPException(401, "Download link is invalid or expired.")
    if claims.get("scope") != "document-download":
        raise HTTPException(401, "Download link is invalid or expired.")
    return claims

_fails: dict[str, list[float]] = {}   # in-memory login throttle (per process); use a shared store behind several workers
def check_throttle(key: str, limit: int = 5, window: int = 300) -> None:
    now = time.time(); recent = [t for t in _fails.get(key, []) if now - t < window]; _fails[key] = recent
    if len(recent) >= limit: raise HTTPException(429, "Too many failed sign-in attempts. Try again in a few minutes.")
def record_failure(key: str) -> None: _fails.setdefault(key, []).append(time.time())
def clear_failures(key: str) -> None: _fails.pop(key, None)

_bearer = HTTPBearer(auto_error=False)
def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)) -> User:
    unauth = HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    if not creds: raise unauth
    try: payload = jwt.decode(creds.credentials, get_settings().secret_key, algorithms=["HS256"], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError: raise HTTPException(401, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})
    user = db.get(User, payload["sub"])
    if not user or not user.is_active: raise unauth
    return user

def require_roles(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles: raise HTTPException(403, "Your role is not permitted to do this")
        return user
    return dep
