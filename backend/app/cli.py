"""python -m app.cli init-db | create-admin | seed-demo   (passwords come from env/prompt, never from code)"""
import argparse, getpass, os, re, secrets, sys
from pathlib import Path
from sqlalchemy import select
from .config import get_settings
from .db import SessionLocal
from .models import User
from .security import hash_password
BASE = Path(__file__).resolve().parent.parent

def init_db() -> None:
    from alembic import command
    from alembic.config import Config
    cfg = Config(str(BASE / "alembic.ini")); cfg.set_main_option("script_location", str(BASE / "alembic")); command.upgrade(cfg, "head")
    from .seed import init_reference_data
    with SessionLocal() as db: init_reference_data(db)
    print("Database is at the latest migration and reference data is loaded.")

def strong(p: str) -> bool: return len(p) >= 12 and len(p.encode()) <= 72 and re.search(r"[A-Za-z]", p) and re.search(r"\d", p)
def create_admin(email: str, name: str) -> None:
    pw = os.getenv("ADMIN_PASSWORD") or getpass.getpass("Admin password (min 12 chars, letters and digits): ")
    if not strong(pw): sys.exit("Password too weak: use at least 12 characters including letters and digits (max 72 bytes).")
    from .seed import init_reference_data
    with SessionLocal() as db:
        init_reference_data(db); email = email.strip().lower()
        if db.scalar(select(User).where(User.email == email)): sys.exit("A user with that email already exists.")
        db.add(User(email=email, full_name=name, role="admin", password_hash=hash_password(pw))); db.commit()
    print(f"Admin {email} created.")

def seed_demo(force: bool) -> None:
    from .db import Base, engine
    from .seed import seed_demo as run
    if force:
        if get_settings().env == "production": sys.exit("--force is disabled when NEXUS_ENV=production.")
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    pw = os.getenv("DEMO_PASSWORD") or secrets.token_urlsafe(12) + "9"; generated = not os.getenv("DEMO_PASSWORD")
    with SessionLocal() as db: run(db, pw)
    print("Fictional demo data loaded. Demo accounts: admin-0, regional-0..4, scrutiny-0..7, evc-0..5, institution-0..9 @nexus-demo.invalid")
    print(f"Demo password (shown once): {pw}" if generated else "Demo password: the value of DEMO_PASSWORD.")

if __name__ == "__main__":
    p = argparse.ArgumentParser(prog="python -m app.cli"); sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init-db"); a = sub.add_parser("create-admin"); a.add_argument("--email", required=True); a.add_argument("--name", required=True)
    s = sub.add_parser("seed-demo"); s.add_argument("--force", action="store_true", help="drop and recreate ALL tables first (demo databases only)")
    n = p.parse_args()
    {"init-db": lambda: init_db(), "create-admin": lambda: create_admin(n.email, n.name), "seed-demo": lambda: seed_demo(n.force)}[n.cmd]()
