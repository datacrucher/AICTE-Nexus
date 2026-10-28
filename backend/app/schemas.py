from typing import Literal
from pydantic import BaseModel, Field, field_validator

class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)
    @field_validator("email")
    @classmethod
    def norm(cls, v: str) -> str: return v.strip().lower()

class TransitionIn(BaseModel):
    action: str = Field(min_length=1, max_length=40, pattern=r"^[a-z_]+$")
    remarks: str | None = Field(default=None, max_length=2000)

class EscalationActIn(BaseModel):
    kind: Literal["acknowledge", "resolve"]
    remarks: str | None = Field(default=None, max_length=2000)

def clean(text: str | None) -> str | None:
    t = (text or "").strip(); return t or None


class ApplicationCreateIn(BaseModel):
    application_type: Literal["New Institution", "Extension of Approval", "Intake Increase", "New Course"]
    remarks: str | None = Field(default=None, max_length=2000)
