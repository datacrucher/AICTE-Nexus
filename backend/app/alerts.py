"""Alerts evaluated from live rows with the DEMO rules (there is no alerts table: they are not stored or acknowledged)."""
import math
from datetime import timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import rules
from .models import ComplianceRequirement, EvcAssignment, EvcVisit, User
from .queries import overview_rows, staff_names, visible_apps

ORDER = {"CRITICAL": 0, "WARNING": 1, "INFO": 2}
def fmt(d) -> str: return d.strftime("%d %b %Y")

def build_alerts(db: Session, user: User, rows=None, cfg=None) -> list[dict]:
    cfg = cfg or rules.load_config(db); today = rules.utcnow().date(); now = rules.utcnow()
    apps = visible_apps(db, user); rows = rows if rows is not None else overview_rows(db, apps, user, cfg); by_id = {r["id"]: r for r in rows}; ids = list(by_id)
    out = []
    def add(key, sev, typ, title, why, due, ref, inst, who): out.append({"id": key, "severity": sev, "type": typ, "title": title, "why": why, "due": due, "appId": ref, "institution": inst, "officer": who})
    for r in rows:
        ref, inst = r["reference"], r["institution_name"]; who = r["officer_name"] or ("Assigned officer" if r["assigned_officer"] or user.role == "institution" else "Unassigned"); st = r["stage"].replace("_", " ")
        if r["sla_status"] == "OVERDUE": add(f"{ref}:OVERDUE", "CRITICAL", "OVERDUE", "Application overdue", f"Rule: days in stage ({r['days_in_stage']}) exceed the demo SLA of {r['sla_days']} days for {st}.", fmt(today + timedelta(days=r["remaining_days"])), ref, inst, who)
        elif r["sla_status"] == "AT_RISK": add(f"{ref}:DEADLINE", "WARNING", "DEADLINE", "Stage deadline approaching", f"Rule: {r['remaining_days']} day(s) remain; alert starts at {cfg.at_risk_days} day(s) or fewer.", fmt(today + timedelta(days=r["remaining_days"])), ref, inst, who)
        ld = r["lease_days"]
        if ld is not None and ld < 0: add(f"{ref}:DOCUMENT", "CRITICAL", "DOCUMENT", "Lease agreement expired", f"Rule: expiry date passed {-ld} day(s) ago.", fmt(today + timedelta(days=ld)), ref, inst, who)
        elif ld is not None:
            step = next((s for s in cfg.doc_steps if ld <= s[0]), None)
            if step: add(f"{ref}:DOCUMENT", step[1], "DOCUMENT", "Lease agreement expiring", f"Rule: expires in {ld} day(s). Demo warning tiers: {'/'.join(str(s[0]) for s in cfg.doc_steps)} days.", fmt(today + timedelta(days=ld)), ref, inst, who)
        if r["open_observations"]: add(f"{ref}:ACTION", "WARNING", "ACTION", f"{r['open_observations']} observation(s) awaiting response", "Rule: open observations remain on the application.", fmt(today + timedelta(days=r["remaining_days"])) if r["remaining_days"] is not None else "n/a", ref, inst, who)
    recs = list(db.scalars(select(ComplianceRequirement).where(ComplianceRequirement.application_id.in_(ids)))) if ids else []
    visits = list(db.scalars(select(EvcVisit).where(EvcVisit.application_id.in_(ids)))) if ids else []
    members = {}
    for a in (db.scalars(select(EvcAssignment).where(EvcAssignment.visit_id.in_([v.id for v in visits]))) if visits else []): members.setdefault(a.visit_id, []).append(a.member_id)
    names = staff_names(db, [r.verifier_id for r in recs] + [m for ms in members.values() for m in ms], user)
    for c in recs:
        a = by_id[c.application_id]; due = rules.aware(c.due_at); days = math.ceil((due - now).total_seconds() / 86400); key = f"{c.reference}:COMPLIANCE"
        def comp(sev, head, why, who): add(key, sev, "COMPLIANCE", f"{head}: {c.title}", why, fmt(due), a["reference"], a["institution_name"], who)
        if c.state in ("NOT_SUBMITTED", "REJECTED") and due < now: comp("CRITICAL", "Compliance overdue", f"Rule: record {c.reference} passed its due date by {-days} day(s) without accepted evidence.", "Institution")
        elif c.state == "REJECTED": comp("WARNING", "Evidence rejected", f"Rule: record {c.reference} evidence was rejected; resubmission required before the due date.", "Institution")
        elif c.state == "SUBMITTED": comp("INFO", "Evidence awaiting verification", f"Rule: record {c.reference} evidence was submitted and has not been reviewed.", names.get(c.verifier_id, "Assigned verifier"))
    for v in visits:
        a = by_id[v.application_id]; when = rules.aware(v.scheduled_for); who = (names.get((members.get(v.id) or [None])[0]) or ("Committee member" if members.get(v.id) else "Unassigned")); key = f"{v.reference}:EVC"
        def evc(sev, title, why): add(key, sev, "EVC", title, why, fmt(when), a["reference"], a["institution_name"], who)
        if v.status == "SCHEDULED" and when < now: evc("WARNING", "EVC visit delayed", f"Rule: visit {v.reference} date has passed and it is not marked completed.")
        elif v.status == "SCHEDULED" and (when - now) < timedelta(days=3): evc("INFO", "EVC visit approaching", f"Rule: visit {v.reference} is within 3 days.")
        if v.status == "COMPLETED" and v.report_status == "PENDING": evc("WARNING", "EVC report pending", f"Rule: visit {v.reference} is completed but no report is submitted.")
    return sorted(out, key=lambda x: ORDER[x["severity"]])
