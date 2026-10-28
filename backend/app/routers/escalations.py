from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from .. import audit, rules
from ..db import get_db
from ..models import AuditEvent, Escalation, User
from ..queries import can_see, overview_rows, visible_apps
from ..schemas import EscalationActIn, clean
from ..security import current_user, require_roles

router = APIRouter(prefix="/escalations", tags=["escalations"]); ACT_ROLES = {"acknowledge": ("admin", "regional"), "resolve": ("admin",)}
def _iso(d): return rules.aware(d).isoformat() if d else None

@router.get("")
def list_escalations(user: User = Depends(require_roles("admin", "regional", "scrutiny")), db: Session = Depends(get_db)):
    rows = {r["id"]: r for r in overview_rows(db, visible_apps(db, user), user)}; ids = list(rows)
    esc = list(db.scalars(select(Escalation).where(Escalation.application_id.in_(ids)).order_by(Escalation.level.desc(), Escalation.opened_at.desc()))) if ids else []
    hist = list(db.scalars(select(AuditEvent).where(AuditEvent.target_type == "escalations", AuditEvent.application_id.in_(ids)).order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc()).limit(50))) if ids else []
    return {"rows": [{"id": e.id, "application_id": e.application_id, "level": e.level, "status": e.status, "reason": e.reason, "opened_at": _iso(e.opened_at), "acknowledged_at": _iso(e.acknowledged_at),
                      "resolved_at": _iso(e.resolved_at), "resolution_remarks": e.resolution_remarks, "app": rows[e.application_id]} for e in esc],
            "history": [{"id": h.id, "ts": int(rules.aware(h.occurred_at).timestamp() * 1000), "application_id": h.application_id, "actor_role": h.actor_role, "action": h.action, "from_value": h.from_value,
                         "to_value": h.to_value, "remarks": h.remarks, "reference": rows[h.application_id]["reference"]} for h in hist]}

@router.post("/{esc_id}/act")
def act(esc_id: str, body: EscalationActIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    e = db.scalar(select(Escalation).where(Escalation.id == esc_id).with_for_update()); note = clean(body.remarks)
    if not e or not can_see(db, user, e.application_id) or user.role not in ("admin", "regional", "scrutiny"): raise HTTPException(404, "Escalation not found")
    if user.role not in ACT_ROLES[body.kind]: raise HTTPException(403, f"Role {user.role} may not {body.kind} escalations")
    old = e.status
    if body.kind == "acknowledge":
        if old != "OPEN": raise HTTPException(409, "Only open escalations can be acknowledged")
        e.status, e.acknowledged_by, e.acknowledged_at = "ACKNOWLEDGED", user.id, rules.utcnow()
    else:
        if old == "RESOLVED": raise HTTPException(409, "Escalation is already resolved")
        if not note: raise HTTPException(422, "Remarks are required to resolve an escalation")
        e.status, e.resolved_by, e.resolved_at, e.resolution_remarks = "RESOLVED", user.id, rules.utcnow(), note
    audit.record(db, user, f"Escalation {body.kind}d", e.application_id, "escalations", e.id, old, e.status, note)
    db.commit()
    return {"id": e.id, "status": e.status}
