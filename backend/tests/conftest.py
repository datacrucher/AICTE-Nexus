import os, tempfile
_tmp = tempfile.mkdtemp()
os.environ.update(DATABASE_URL=os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_tmp}/test.db", SECRET_KEY="test-secret-key-0123456789-0123456789-xx", BCRYPT_ROUNDS="4", NEXUS_ENV="development")
import pytest
from fastapi.testclient import TestClient
from app import security, seed
from app.db import Base, SessionLocal, engine
from app.main import app
PASSWORD = "Test-Password-123"

@pytest.fixture
def client():
    Base.metadata.drop_all(engine); Base.metadata.create_all(engine); security._fails.clear()
    with SessionLocal() as db: seed.seed_demo(db, PASSWORD)
    with TestClient(app, raise_server_exceptions=False) as c: yield c

def login(c, role, n=0, password=PASSWORD): return c.post("/api/auth/login", json={"email": f"{role}-{n}@nexus-demo.invalid", "password": password})
def hdr(c, role, n=0): return {"Authorization": "Bearer " + login(c, role, n).json()["access_token"]}
