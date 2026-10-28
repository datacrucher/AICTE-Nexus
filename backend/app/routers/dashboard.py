from collections import Counter
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from .. import rules
from ..alerts import build_alerts
from ..db import get_db
from ..models import AuditEvent, Escalation, EvcVisit, User
from ..queries import overdue_compliance, overview_rows, visible_apps
from ..security import current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
ESC_ROLES = ("admin", "regional", "scrutiny")

@router.get("")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    cfg = rules.load_config(db); rows = overview_rows(db, visible_apps(db, user), user, cfg); ids = [r["id"] for r in rows]; now = rules.utcnow()
    alerts = build_alerts(db, user, rows, cfg)
    open_esc = len(list(db.scalars(select(Escalation.id).where(Escalation.application_id.in_(ids), Escalation.status != "RESOLVED")))) if ids and user.role in ESC_ROLES else 0
    visits = list(db.scalars(select(EvcVisit).where(EvcVisit.application_id.in_(ids)))) if ids else []
    pending = [r for r in rows if r["stage"] not in ("APPROVED", "REJECTED")]; overdue = [r for r in rows if r["sla_status"] == "OVERDUE"]
    metrics = {"total_applications": len(rows), "pending_applications": len(pending), "approved_applications": sum(r["stage"] == "APPROVED" for r in rows), "overdue_applications": len(overdue), "open_escalations": open_esc,
               "overdue_compliance": len(overdue_compliance(db, ids, now)), "upcoming_evc_visits": sum(v.status == "SCHEDULED" and rules.aware(v.scheduled_for) >= now for v in visits),
               "pending_evc_reports": sum(v.status == "COMPLETED" and v.report_status == "PENDING" for v in visits), "critical_alerts": sum(a["severity"] == "CRITICAL" for a in alerts)}
    regions = sorted({r["region_name"] for r in rows}); queue = sorted((r for r in rows if r["sla_status"] in ("OVERDUE", "AT_RISK")), key=lambda r: (-r["risk_score"], r["reference"]))[:8]
    risk = Counter(r["risk_level"] for r in rows); refs = {r["id"]: r["reference"] for r in rows}
    stmt = select(AuditEvent).order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc()).limit(8)
    if user.role != "admin": stmt = stmt.where(AuditEvent.application_id.in_(ids))
    if user.role == "institution": stmt = stmt.where((AuditEvent.target_type.is_(None)) | (AuditEvent.target_type != "escalations"))
    recent = [{"id": e.id, "ts": int(rules.aware(e.occurred_at).timestamp() * 1000), "actor": e.actor_role or "system", "action": e.action, "reference": refs.get(e.application_id), "from": e.from_value, "to": e.to_value, "simulated": e.is_seed}
              for e in db.scalars(stmt)] if (ids or user.role == "admin") else []
    return {"metrics": metrics, "stages": dict(Counter(r["stage"] for r in rows)), "regions": [{"name": n, "overdue": sum(r["region_name"] == n and r["sla_status"] == "OVERDUE" for r in rows)} for n in regions],
            "queue": queue, "risk": {k: risk.get(k, 0) for k in ("LOW", "MEDIUM", "HIGH", "CRITICAL")}, "riskTruncated": False, "recent": recent}

@router.get("/critical-alerts")
def critical_alerts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"critical_alerts": sum(a["severity"] == "CRITICAL" for a in build_alerts(db, user))}
