"""Business rules (DEMO values from the settings tables): SLA status, risk score, escalation level. Official AICTE rules are NOT encoded."""
from dataclasses import dataclass
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import Setting, WorkflowStage

DEFAULTS = {"at_risk_days": 2, "doc_alert_steps": [[7, "CRITICAL"], [15, "WARNING"], [30, "INFO"]],
            "risk_weights": {"overdue": 40, "atRisk": 20, "leaseExpired": 25, "leaseExpiring": 10, "perObservation": 10, "complianceOverdue": 25},
            "risk_levels": [[20, "LOW"], [40, "MEDIUM"], [65, "HIGH"], [None, "CRITICAL"]], "escalation_steps": [[10, 4], [7, 3], [4, 2], [1, 1]]}

@dataclass
class Config:
    sla_days: dict; terminal: set; at_risk_days: int; doc_steps: list; weights: dict; levels: list; esc_steps: list

def load_config(db: Session) -> Config:
    st = db.scalars(select(WorkflowStage)).all(); s = {**DEFAULTS, **{x.key: x.value for x in db.scalars(select(Setting))}}
    return Config({x.stage: x.sla_days for x in st}, {x.stage for x in st if x.is_terminal}, int(s["at_risk_days"]), s["doc_alert_steps"], s["risk_weights"], s["risk_levels"], s["escalation_steps"])

def aware(dt):
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)
def utcnow() -> datetime: return datetime.now(timezone.utc)
def whole_days(delta) -> int: return int(delta.total_seconds() // 86400)   # floor, as the SQL view did

def sla_for(stage, days_in_stage, cfg):
    if stage in cfg.terminal: return None, None, "DONE"
    sla = cfg.sla_days.get(stage)
    if sla is None: return None, None, "N/A"
    rem = sla - days_in_stage
    return sla, rem, ("OVERDUE" if rem < 0 else "AT_RISK" if rem <= cfg.at_risk_days else "ON_TRACK")

def escalation_level_for(days_over, cfg) -> int:
    return max([lvl for d, lvl in cfg.esc_steps if days_over >= d] or [0])

def risk(cfg, sla_status, remaining, lease_days, open_obs, comp_days):
    w, score, why = cfg.weights, 0, []
    if sla_status == "OVERDUE": score += w["overdue"]; why.append(f"Stage SLA exceeded by {-remaining} days")
    elif sla_status == "AT_RISK": score += w["atRisk"]; why.append(f"Only {remaining} day(s) left in stage SLA")
    if lease_days is not None and lease_days < 0: score += w["leaseExpired"]; why.append(f"Lease agreement expired {-lease_days} days ago")
    elif lease_days is not None and lease_days < 30: score += w["leaseExpiring"]; why.append(f"Lease agreement expires in {lease_days} days")
    if open_obs: score += open_obs * w["perObservation"]; why.append(f"{open_obs} unresolved observation(s)")
    if comp_days is not None and comp_days < 0: score += w["complianceOverdue"]; why.append(f"Compliance undertaking overdue by {-comp_days} days")
    level = next(lv for lim, lv in cfg.levels if lim is None or score < lim)
    return score, level, why
