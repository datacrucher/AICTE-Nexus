"""Role-based visibility (the single source of truth) and the application overview rows used by every endpoint."""
from collections import defaultdict
from datetime import date
from sqlalchemy import select, true
from sqlalchemy.orm import Session
from . import rules
from .models import Application, ComplianceRequirement, Document, EvcAssignment, Institution, Observation, Region, User

STAFF = ("admin", "regional", "scrutiny", "evc")
def app_filter(user: User):
    """SQL condition: which applications this user may see."""
    if user.role == "admin": return true()
    if user.role == "regional": return Application.region_code == user.region_code
    if user.role == "scrutiny": return Application.assigned_officer_id == user.id
    if user.role == "institution": return Application.institution_id == user.institution_id
    if user.role == "evc": return Application.id.in_(select(EvcAssignment.application_id).where(EvcAssignment.member_id == user.id))
    return Application.id == "__none__"
def visible_apps(db: Session, user: User) -> list[Application]:
    return list(db.scalars(select(Application).where(app_filter(user)).order_by(Application.reference)))
def can_see(db: Session, user: User, app_id: str) -> bool:
    return db.scalar(select(Application.id).where(Application.id == app_id, app_filter(user))) is not None
def staff_names(db: Session, ids, user: User) -> dict:
    """Names of staff users; institutions never receive staff identities."""
    ids = [i for i in set(ids) if i]
    if not ids or user.role not in STAFF: return {}
    return {u.id: u.full_name for u in db.scalars(select(User).where(User.id.in_(ids), User.role != "institution", User.is_active))}

def overdue_compliance(db: Session, app_ids, now=None):
    now = now or rules.utcnow()
    recs = db.scalars(select(ComplianceRequirement).where(ComplianceRequirement.application_id.in_(app_ids), ComplianceRequirement.state.in_(("NOT_SUBMITTED", "REJECTED")))).all() if app_ids else []
    return [r for r in recs if rules.aware(r.due_at) < now]

def overview_rows(db: Session, apps: list[Application], user: User, cfg=None) -> list[dict]:
    cfg = cfg or rules.load_config(db); now = rules.utcnow(); today = now.date(); ids = [a.id for a in apps]
    if not ids: return []
    lease, obs, comp = {}, defaultdict(int), {}
    for d in db.scalars(select(Document).where(Document.application_id.in_(ids), Document.doc_type == "LEASE", Document.expiry_date.is_not(None))):
        lease[d.application_id] = max(lease.get(d.application_id, date.min), d.expiry_date)
    for o in db.scalars(select(Observation).where(Observation.application_id.in_(ids), Observation.status == "OPEN")): obs[o.application_id] += 1
    for r in overdue_compliance(db, ids, now):
        days = rules.whole_days(rules.aware(r.due_at) - now); comp[r.application_id] = min(comp.get(r.application_id, days), days)
    inst = {i.id: i.name for i in db.scalars(select(Institution))}; reg = {r.code: r.name for r in db.scalars(select(Region))}
    officers = staff_names(db, [a.assigned_officer_id for a in apps], user)
    rows = []
    for a in apps:
        days = rules.whole_days(now - rules.aware(a.stage_started_at)); sla, rem, status = rules.sla_for(a.stage, days, cfg)
        lease_days = (lease[a.id] - today).days if a.id in lease else None
        score, level, why = rules.risk(cfg, status, rem, lease_days, obs[a.id], comp.get(a.id))
        rows.append({"id": a.id, "reference": a.reference, "institution_id": a.institution_id, "region_code": a.region_code, "institution_name": inst.get(a.institution_id), "region_name": reg.get(a.region_code),
            "application_type": a.application_type, "stage": a.stage, "stage_started_at": rules.aware(a.stage_started_at).isoformat(), "submitted_at": rules.aware(a.submitted_at).isoformat() if a.submitted_at else None,
            "assigned_officer": a.assigned_officer_id if user.role in STAFF else None, "officer_name": officers.get(a.assigned_officer_id), "priority": a.priority, "days_in_stage": days, "sla_days": sla, "remaining_days": rem,
            "sla_status": status, "lease_days": lease_days, "open_observations": obs[a.id], "compliance_overdue_days": comp.get(a.id), "risk_score": score, "risk_reasons": why, "risk_level": level,
            "escalation_level": rules.escalation_level_for(-rem, cfg) if status == "OVERDUE" else 0,
            "days_pending": rules.whole_days(now - rules.aware(a.submitted_at)) if a.submitted_at else None})
    return rows
