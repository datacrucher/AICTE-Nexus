"""Backend settings from environment variables. Secrets live only here, never in the frontend bundle."""
import os, secrets
from dataclasses import dataclass
from functools import lru_cache
from dotenv import load_dotenv
load_dotenv()

@dataclass(frozen=True)
class Settings:
    env: str
    database_url: str
    secret_key: str
    token_minutes: int
    cors_origins: list
    bcrypt_rounds: int

def _db_url(url: str) -> str:
    if url.startswith("postgres://"): url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"): url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url

@lru_cache
def get_settings() -> Settings:
    env = os.getenv("NEXUS_ENV", "development").lower()
    key = os.getenv("SECRET_KEY", "")
    if env == "production" and (len(key) < 32 or key.lower().startswith("change")):
        raise RuntimeError("SECRET_KEY must be set to a random value of at least 32 characters when NEXUS_ENV=production")
    if not key: key = secrets.token_urlsafe(48)   # development only: tokens stop working when the process restarts
    return Settings(env=env, database_url=_db_url(os.getenv("DATABASE_URL", "sqlite:///./nexus_dev.db")), secret_key=key,
                    token_minutes=int(os.getenv("ACCESS_TOKEN_MINUTES", "480")), bcrypt_rounds=int(os.getenv("BCRYPT_ROUNDS", "12")),
                    cors_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()])
