import time, jwt
from sqlalchemy import select
from app.config import get_settings
from app.db import SessionLocal
from app.models import AuditEvent, User
from app.seed import sid
from .conftest import PASSWORD, hdr, login

def test_login_returns_token_and_database_role(client):
    r = login(client, "institution", 0); assert r.status_code == 200
    b = r.json(); assert b["user"]["role"] == "institution" and b["token_type"] == "bearer" and "password" not in str(b)
def test_passwords_are_hashed(client):
    with SessionLocal() as db: h = db.scalar(select(User.password_hash).where(User.email == "admin-0@nexus-demo.invalid"))
    assert h.startswith("$2") and PASSWORD not in h
def test_bad_credentials_get_one_generic_message(client):
    a = login(client, "admin", 0, "wrong"); b = client.post("/api/auth/login", json={"email": "nobody@nexus-demo.invalid", "password": "x"})
    assert a.status_code == b.status_code == 401 and a.json()["detail"] == b.json()["detail"] == "Invalid email or password"
def test_throttle_after_repeated_failures(client):
    codes = [login(client, "admin", 1, "bad").status_code for _ in range(6)]; assert codes[:5] == [401] * 5 and codes[5] == 429
    assert login(client, "admin", 1).status_code == 429   # even the right password is blocked while throttled
def test_protected_routes_need_a_token(client):
    for path in ("/api/auth/me", "/api/applications", "/api/dashboard", "/api/alerts", "/api/escalations", "/api/workflow/actions"): assert client.get(path).status_code == 401, path
    assert client.get("/api/applications", headers={"Authorization": "Bearer not-a-token"}).status_code == 401
def test_token_cannot_carry_a_role(client):   # a validly signed token with a forged role claim must not change the role
    uid = login(client, "institution", 0).json()["user"]["id"]
    forged = jwt.encode({"sub": uid, "role": "admin", "exp": int(time.time()) + 600}, get_settings().secret_key, algorithm="HS256")
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"}).json(); assert me["role"] == "institution"
    assert client.get("/api/escalations", headers={"Authorization": f"Bearer {forged}"}).status_code == 403
def test_expired_and_wrongly_signed_tokens_rejected(client):
    uid = login(client, "admin", 0).json()["user"]["id"]
    expired = jwt.encode({"sub": uid, "exp": int(time.time()) - 5}, get_settings().secret_key, algorithm="HS256")
    other = jwt.encode({"sub": uid, "exp": int(time.time()) + 600}, "x" * 40, algorithm="HS256")
    for t in (expired, other): assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {t}"}).status_code == 401
def test_deactivated_user_loses_access_immediately(client):
    h = hdr(client, "scrutiny", 3); assert client.get("/api/auth/me", headers=h).status_code == 200
    with SessionLocal() as db: db.get(User, sid("scrutiny", 3)).is_active = False; db.commit()
    assert client.get("/api/auth/me", headers=h).status_code == 401 and login(client, "scrutiny", 3).status_code == 401
def test_validation_errors_use_the_standard_error_shape(client):
    r = client.post("/api/auth/login", json={"email": "x"}); assert r.status_code == 422 and r.json()["code"] == 422 and "detail" in r.json()
def test_unknown_errors_do_not_leak_details(client):
    assert client.get("/api/nope").status_code == 404
