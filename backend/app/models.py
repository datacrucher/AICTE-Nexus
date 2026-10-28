"""SQLAlchemy 2 models. Mirrors the earlier Supabase schema (users replace auth.users + profiles)."""
import uuid
from datetime import date, datetime, timezone
from sqlalchemy import JSON, BigInteger, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, event
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

ROLES = ("admin", "regional", "scrutiny", "institution", "evc")
def uid() -> str: return str(uuid.uuid4())
def now() -> datetime: return datetime.now(timezone.utc)
TS = DateTime(timezone=True)
ID = String(36)

class Region(Base):
    __tablename__ = "regions"
    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)

class Institution(Base):
    __tablename__ = "institutions"
    id: Mapped[str] = mapped_column(ID, primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    region_code: Mapped[str] = mapped_column(ForeignKey("regions.code"))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(ID, primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20))
    institution_id: Mapped[str | None] = mapped_column(ForeignKey("institutions.id"), nullable=True)
    region_code: Mapped[str | None] = mapped_column(ForeignKey("regions.code"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=now)
    __table_args__ = (CheckConstraint("role in ('admin','regional','scrutiny','institution','evc')", name="ck_users_role"),
                      CheckConstraint("(role = 'institution') = (institution_id is not null)", name="ck_users_institution_scope"),
                      CheckConstraint("role <> 'regional' or region_code is not null", name="ck_users_regional_scope"))

class WorkflowStage(Base):
    __tablename__ = "workflow_stages"
    stage: Mapped[str] = mapped_column(String(40), primary_key=True)
    ordinal: Mapped[int] = mapped_column(Integer, unique=True)
    sla_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_terminal: Mapped[bool] = mapped_column(Boolean, default=False)

class WorkflowAction(Base):
    __tablename__ = "workflow_actions"
    action_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    role: Mapped[str] = mapped_column(String(20), primary_key=True)
    label: Mapped[str] = mapped_column(String(100))
    from_stage: Mapped[str] = mapped_column(ForeignKey("workflow_stages.stage"))
    to_stage: Mapped[str] = mapped_column(ForeignKey("workflow_stages.stage"))

class Setting(Base):   # DEMO timelines/weights; replace once official AICTE rules are verified
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[object] = mapped_column(JSON)
    config_status: Mapped[str] = mapped_column(String(10), default="DEMO")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

class Application(Base):
    __tablename__ = "applications"
    id: Mapped[str] = mapped_column(ID, primary_key=True, default=uid)
    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    institution_id: Mapped[str] = mapped_column(ForeignKey("institutions.id"), index=True)
    region_code: Mapped[str] = mapped_column(ForeignKey("regions.code"))
    application_type: Mapped[str] = mapped_column(String(40))
    stage: Mapped[str] = mapped_column(ForeignKey("workflow_stages.stage"), default="DRAFT")
    stage_started_at: Mapped[datetime] = mapped_column(TS, default=now)
    submitted_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    assigned_officer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    priority: Mapped[str] = mapped_column(String(10), default="Normal")
    created_by: Mapped[str | None] = mapped_column(ID, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=now)
    __table_args__ = (Index("ix_app_region_stage", "region_code", "stage"),)

class StageHistory(Base):
    __tablename__ = "application_stage_history"
    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    from_stage: Mapped[str | None] = mapped_column(String(40), nullable=True)
    to_stage: Mapped[str] = mapped_column(String(40))
    changed_by: Mapped[str | None] = mapped_column(ID, nullable=True)   # no FK: history survives user removal
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=now)

class Observation(Base):
    __tablename__ = "observations"
    id: Mapped[str] = mapped_column(ID, primary_key=True, default=uid)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default="OPEN")
    raised_by: Mapped[str | None] = mapped_column(ID, nullable=True)
    raised_at: Mapped[datetime] = mapped_column(TS, default=now)
    response_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    __table_args__ = (UniqueConstraint("application_id", "seq"),)

class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(ID, primary_key=True, default=uid)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    institution_id: Mapped[str] = mapped_column(ForeignKey("institutions.id"))
    doc_type: Mapped[str] = mapped_column(String(20))
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    verification_status: Mapped[str] = mapped_column(String(12), default="PENDING")
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    storage_path: Mapped[str | None] = mapped_column(String(500), nullable=True)   # file storage is not implemented yet
    created_at: Mapped[datetime] = mapped_column(TS, default=now)

class ComplianceRequirement(Base):
    __tablename__ = "compliance_requirements"
    id: Mapped[str] = mapped_column(ID, primary_key=True, default=uid)
    reference: Mapped[str] = mapped_column(String(20), unique=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_at: Mapped[datetime] = mapped_column(TS)
    state: Mapped[str] = mapped_column(String(14), default="NOT_SUBMITTED")
    verifier_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)

class EvidenceSubmission(Base):
    __tablename__ = "evidence_submissions"
    id: Mapped[str] = mapped_column(ID, primary_key=True, default=uid)
    compliance_id: Mapped[str] = mapped_column(ForeignKey("compliance_requirements.id"), index=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"))
    file_name: Mapped[str] = mapped_column(String(255))
    file_size: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision: Mapped[str] = mapped_column(String(10), default="PENDING")
    submitted_by: Mapped[str | None] = mapped_column(ID, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=now)
    reviewed_by: Mapped[str | None] = mapped_column(ID, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    review_remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

class EvcVisit(Base):
    __tablename__ = "evc_visits"
    id: Mapped[str] = mapped_column(ID, primary_key=True, default=uid)
    reference: Mapped[str] = mapped_column(String(20), unique=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    status: Mapped[str] = mapped_column(String(12), default="SCHEDULED")
    scheduled_for: Mapped[datetime] = mapped_column(TS)
    report_status: Mapped[str] = mapped_column(String(10), default="NOT_DUE")
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_by: Mapped[str | None] = mapped_column(ID, nullable=True)

class EvcAssignment(Base):
    __tablename__ = "evc_assignments"
    visit_id: Mapped[str] = mapped_column(ForeignKey("evc_visits.id"), primary_key=True)
    member_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)

class EvcReport(Base):
    __tablename__ = "evc_reports"
    id: Mapped[str] = mapped_column(ID, primary_key=True, default=uid)
    visit_id: Mapped[str] = mapped_column(ForeignKey("evc_visits.id"), unique=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"))
    observations: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str] = mapped_column(Text)
    submitted_by: Mapped[str | None] = mapped_column(ID, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(TS, default=now)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)

class Escalation(Base):
    __tablename__ = "escalations"
    id: Mapped[str] = mapped_column(ID, primary_key=True, default=uid)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    level: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(14), default="OPEN")
    reason: Mapped[str] = mapped_column(Text)
    opened_at: Mapped[datetime] = mapped_column(TS, default=now)
    acknowledged_by: Mapped[str | None] = mapped_column(ID, nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(ID, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    resolution_remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    __table_args__ = (CheckConstraint("level between 1 and 4", name="ck_esc_level"),)

class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(ID, primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(10), default="INFO")
    application_id: Mapped[str | None] = mapped_column(ForeignKey("applications.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=now)
    read_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)

class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    occurred_at: Mapped[datetime] = mapped_column(TS, default=now, index=True)
    actor_id: Mapped[str | None] = mapped_column(ID, nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    action: Mapped[str] = mapped_column(String(100))
    application_id: Mapped[str | None] = mapped_column(ForeignKey("applications.id"), nullable=True, index=True)
    target_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    target_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    from_value: Mapped[str | None] = mapped_column(String(100), nullable=True)
    to_value: Mapped[str | None] = mapped_column(String(100), nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_seed: Mapped[bool] = mapped_column(Boolean, default=False)

# Append-only at the application layer. A database owner can still alter rows: this is not tamper-proof.
@event.listens_for(AuditEvent, "before_update")
@event.listens_for(AuditEvent, "before_delete")
def _audit_append_only(*_):
    raise RuntimeError("audit_events is append-only")
