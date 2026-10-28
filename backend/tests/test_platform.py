import os, sqlite3, subprocess, sys
from pathlib import Path
import pytest
from sqlalchemy import select
from app.db import SessionLocal
from app.models import AuditEvent
BACKEND = Path(__file__).resolve().parent.parent
def cli(*args, env=None): return subprocess.run([sys.executable, "-m", "app.cli", *args], cwd=BACKEND, env={**os.environ, **(env or {})}, capture_output=True, text=True)

def test_migrations_create_the_schema_and_reference_data(tmp_path):
    db = tmp_path / "m.db"; r = cli("init-db", env={"DATABASE_URL": f"sqlite:///{db}"}); assert r.returncode == 0, r.stderr
    c = sqlite3.connect(db); assert c.execute("select count(*) from workflow_stages").fetchone()[0] == 10 and c.execute("select count(*) from workflow_actions").fetchone()[0] == 7
    assert {"users", "applications", "audit_events", "escalations", "alembic_version"} <= {x[0] for x in c.execute("select name from sqlite_master where type='table'")}
def test_create_admin_uses_env_password_and_rejects_weak_ones(tmp_path):
    env = {"DATABASE_URL": f"sqlite:///{tmp_path / 'a.db'}"}; assert cli("init-db", env=env).returncode == 0
    assert cli("create-admin", "--email", "boss@example.test", "--name", "Boss", env={**env, "ADMIN_PASSWORD": "short1"}).returncode != 0
    ok = cli("create-admin", "--email", "boss@example.test", "--name", "Boss", env={**env, "ADMIN_PASSWORD": "A-long-passphrase-42"}); assert ok.returncode == 0, ok.stderr
    h = sqlite3.connect(tmp_path / "a.db").execute("select password_hash from users").fetchone()[0]; assert h.startswith("$2") and "passphrase" not in h
def test_production_requires_a_strong_secret():
    r = subprocess.run([sys.executable, "-c", "from app.config import get_settings; get_settings()"], cwd=BACKEND, env={**os.environ, "NEXUS_ENV": "production", "SECRET_KEY": "short"}, capture_output=True, text=True)
    assert r.returncode != 0 and "SECRET_KEY" in r.stderr
def test_demo_seed_force_is_blocked_in_production(tmp_path):
    r = cli("seed-demo", "--force", env={"NEXUS_ENV": "production", "SECRET_KEY": "k" * 40, "DATABASE_URL": f"sqlite:///{tmp_path / 'p.db'}"}); assert r.returncode != 0
def test_audit_events_are_append_only_at_the_application_layer(client):
    with SessionLocal() as db:
        e = db.scalar(select(AuditEvent).limit(1)); e.remarks = "tamper"
        with pytest.raises(RuntimeError): db.commit()
        db.rollback(); db.delete(db.scalar(select(AuditEvent).limit(1)))
        with pytest.raises(RuntimeError): db.commit()
def test_cors_only_allows_configured_origins(client):
    ok = client.options("/api/applications", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    bad = client.options("/api/applications", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173" and "access-control-allow-origin" not in bad.headers
def test_health_endpoint_is_public_and_minimal(client): assert client.get("/api/health").json() == {"status": "ok"}
