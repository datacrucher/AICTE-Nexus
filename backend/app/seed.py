"""Reference data (needed in every deployment) and FICTIONAL demo data mirroring the frontend demo. Dates are relative to the moment the seed runs."""
import uuid
from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import rules
from .models import *
from .security import hash_password

NS = uuid.UUID("5d0f5a64-9a39-4f0a-9d79-3c6f1d3b7a10")
def sid(kind, n) -> str: return str(uuid.uuid5(NS, f"{kind}-{n}"))   # stable ids so tests and docs can refer to seeded records
REGIONS = [("SOUTHERN", "Southern"), ("WESTERN", "Western"), ("EASTERN", "Eastern"), ("NORTHERN", "Northern"), ("CENTRAL", "Central")]
STAGES = [("DRAFT", 0, None, False), ("SUBMITTED", 1, 3, False), ("SCRUTINY", 2, 10, False), ("RESUBMISSION_REQUIRED", 3, 7, False), ("EVC_REQUIRED", 4, 5, False), ("EVC_SCHEDULED", 5, 14, False),
          ("COMMITTEE_REVIEW", 6, 10, False), ("FINAL_REVIEW", 7, 7, False), ("APPROVED", 8, None, True), ("REJECTED", 9, None, True)]
ACTIONS = [("start", "scrutiny", "Start scrutiny", "SUBMITTED", "SCRUTINY"), ("raise", "scrutiny", "Raise observation", "SCRUTINY", "RESUBMISSION_REQUIRED"), ("complete", "scrutiny", "Mark scrutiny complete", "SCRUTINY", "EVC_REQUIRED"),
           ("respond", "institution", "Submit response to observations", "RESUBMISSION_REQUIRED", "SCRUTINY"),
           ("schedule_evc", "evc", "Record EVC visit scheduled", "EVC_REQUIRED", "EVC_SCHEDULED"),
           ("complete_visit", "evc", "Complete EVC visit and submit report", "EVC_SCHEDULED", "COMMITTEE_REVIEW"),
           ("forward", "regional", "Forward to final review", "COMMITTEE_REVIEW", "FINAL_REVIEW"),
           ("approve", "admin", "Record approval decision", "FINAL_REVIEW", "APPROVED"), ("reject", "admin", "Record rejection decision", "FINAL_REVIEW", "REJECTED")]
FLOW = ["SUBMITTED", "SCRUTINY", "RESUBMISSION_REQUIRED", "EVC_REQUIRED", "EVC_SCHEDULED", "COMMITTEE_REVIEW", "FINAL_REVIEW", "APPROVED"]
INSTS = ["Sri Venkateswara Institute of Technology", "Narayana College of Engineering", "Deccan School of Management", "Lakeview Institute of Pharmacy", "Greenfield Polytechnic", "Arunodaya Institute of Technology",
         "Coastal School of Architecture", "Himalaya College of Engineering", "Metro Institute of Computer Applications", "Sapphire Institute of Technology"]
OFFICERS = ["A. Rao", "P. Sharma", "M. Iyer", "S. Khan", "R. Das", "K. Nair", "V. Singh", "L. Reddy"]
COMMITTEE = ["Dr. N. Prasad", "Prof. S. Mehta", "Dr. R. Banerjee", "Prof. K. Joshi", "Dr. T. Menon", "Prof. A. Qureshi"]
TYPES = ["New Institution", "Extension of Approval", "Intake Increase", "New Course"]
STG = ["SCRUTINY", "SCRUTINY", "SUBMITTED", "RESUBMISSION_REQUIRED", "EVC_REQUIRED", "EVC_SCHEDULED", "COMMITTEE_REVIEW", "APPROVED", "FINAL_REVIEW", "SCRUTINY"]
OVR = {7: ("EVC_SCHEDULED", 3), 8: ("EVC_SCHEDULED", 6), 14: ("EVC_SCHEDULED", 1), 21: ("COMMITTEE_REVIEW", 2), 27: ("COMMITTEE_REVIEW", 4)}
OBS = ["Faculty list incomplete", "Lease agreement needs renewal evidence", "Building plan approval copy missing"]
COMP = [("Faculty recruitment undertaking", -12, "NOT_SUBMITTED"), ("Fire safety NOC renewal", 5, "NOT_SUBMITTED"), ("Laboratory setup evidence", 20, "SUBMITTED"), ("Library resource undertaking", -3, "REJECTED"),
        ("Building plan compliance", 40, "NOT_SUBMITTED"), ("Faculty recruitment undertaking", 12, "VERIFIED"), ("Lease renewal evidence", -20, "NOT_SUBMITTED"), ("Fire safety NOC renewal", 8, "SUBMITTED"),
        ("Laboratory setup evidence", 30, "NOT_SUBMITTED"), ("Library resource undertaking", 2, "NOT_SUBMITTED")]
COMP_APPS = [0, 10, 20, 1, 6, 11, 3, 7, 12, 15]

def init_reference_data(db: Session) -> None:
    """Idempotent: regions, workflow stages/actions and DEMO settings."""
    for c, n in REGIONS:
        if not db.get(Region, c): db.add(Region(code=c, name=n))
    for s, o, d, t in STAGES:
        if not db.get(WorkflowStage, s): db.add(WorkflowStage(stage=s, ordinal=o, sla_days=d, is_terminal=t))
    db.flush()
    for a in ACTIONS:
        if not db.get(WorkflowAction, (a[0], a[1])): db.add(WorkflowAction(action_id=a[0], role=a[1], label=a[2], from_stage=a[3], to_stage=a[4]))
    for k, v in rules.DEFAULTS.items():
        if not db.get(Setting, k): db.add(Setting(key=k, value=v, note="DEMO value. Replace once official AICTE rules are verified."))
    db.commit()

def seed_demo(db: Session, password: str) -> None:
    if db.scalar(select(User.id).limit(1)): raise RuntimeError("Users already exist; refusing to seed. Use a fresh database.")
    init_reference_data(db); cfg = rules.load_config(db); now = rules.utcnow(); day = lambda n: timedelta(days=n)
    ph = lambda: hash_password(password)
    for k, name in enumerate(INSTS): db.add(Institution(id=sid("inst", k), name=name, region_code=REGIONS[k % 5][0]))
    db.flush()
    users = [User(id=sid("admin", 0), email="admin-0@nexus-demo.invalid", full_name="Dr. Meera Krishnan (demo Competent Authority)", role="admin", password_hash=ph())]
    users += [User(id=sid("regional", n), email=f"regional-{n}@nexus-demo.invalid", full_name=f"Regional Officer {REGIONS[n][1]}", role="regional", region_code=REGIONS[n][0], password_hash=ph()) for n in range(5)]
    users += [User(id=sid("scrutiny", n), email=f"scrutiny-{n}@nexus-demo.invalid", full_name=OFFICERS[n], role="scrutiny", password_hash=ph()) for n in range(8)]
    users += [User(id=sid("evc", n), email=f"evc-{n}@nexus-demo.invalid", full_name=COMMITTEE[n], role="evc", password_hash=ph()) for n in range(6)]
    users += [User(id=sid("institution", k), email=f"institution-{k}@nexus-demo.invalid", full_name=f"Registrar, {INSTS[k]}", role="institution", institution_id=sid("inst", k), password_hash=ph()) for k in range(10)]
    db.add_all(users); db.flush(); apps = []
    for i in range(30):
        stage, d = OVR.get(i) or (STG[(3 * i + i % 4) % 10], (i * 7) % 16 + 1)
        a = Application(id=sid("app", i), reference=f"AICTE-2026-{1001 + i * 7}", institution_id=sid("inst", i % 10), region_code=REGIONS[i % 5][0], application_type=TYPES[i % 4], stage=stage,
                        stage_started_at=now - day(d), submitted_at=now - day(d + 20 + i), assigned_officer_id=sid("scrutiny", i % 8), priority="High" if i % 5 == 0 else "Normal"); apps.append((a, d, i)); db.add(a)
    db.flush()
    for a, d, i in apps:
        idx = FLOW.index(a.stage)
        for o in range(idx + 1):
            at = now - day(d + (idx - o) * 4); prev = FLOW[o - 1] if o else None
            db.add(StageHistory(application_id=a.id, from_stage=prev, to_stage=FLOW[o], changed_by=a.assigned_officer_id, remarks="Seeded demo event", created_at=at))
            db.add(AuditEvent(occurred_at=at, actor_id=a.assigned_officer_id, actor_role="scrutiny", action="Application submitted" if prev is None else "Stage changed", application_id=a.id, target_type="applications",
                              target_ref=a.reference, from_value=prev, to_value=FLOW[o], remarks="Seeded demo event", is_seed=True))
        if a.stage in ("SCRUTINY", "RESUBMISSION_REQUIRED"):
            for n in range(1, i % 3 + 1): db.add(Observation(application_id=a.id, seq=n, body=OBS[(n - 1) % 3], raised_by=a.assigned_officer_id, raised_at=now - day(3)))
        for typ, off in (("LEASE", (i * 13) % 60 - 8), ("NOC", 200), ("AFFILIATION", 90 + d + 20 + i)):
            exp = (now + day(off)).date(); db.add(Document(application_id=a.id, institution_id=a.institution_id, doc_type=typ, issue_date=exp - day(365), expiry_date=exp, verification_status="VERIFIED", file_name=f"{typ.lower()}-demo.pdf"))
        sla = cfg.sla_days.get(a.stage)
        if sla is not None and d > sla:
            db.add(Escalation(application_id=a.id, level=rules.escalation_level_for(d - sla, cfg), reason=f"{a.stage} stage exceeded the demo SLA by {d - sla} day(s)", opened_at=now - day(1)))
    for k, (title, due, state) in enumerate(COMP):
        app_i = COMP_APPS[k]; cid = sid("cmp", k)
        db.add(ComplianceRequirement(id=cid, reference=f"CMP-{k + 1:03d}", application_id=sid("app", app_i), title=title, due_at=now + day(due), state=state, verifier_id=sid("regional", app_i % 5))); db.flush()
        if state != "NOT_SUBMITTED":
            dec = "PENDING" if state == "SUBMITTED" else state
            db.add(EvidenceSubmission(compliance_id=cid, application_id=sid("app", app_i), file_name=f"evidence-{k + 1}.pdf", file_size=120000, note="Seeded demo submission", decision=dec, submitted_by=sid("institution", app_i % 10),
                                      created_at=now - day(5), reviewed_by=sid("regional", app_i % 5) if dec != "PENDING" else None, reviewed_at=now - day(2) if dec != "PENDING" else None,
                                      review_remarks={"REJECTED": "Evidence illegible; please resubmit", "VERIFIED": "Evidence accepted (demo)"}.get(dec)))
    for n, (app_i, status, off, rep, m1, m2) in enumerate([(7, "SCHEDULED", timedelta(days=4), "NOT_DUE", 0, 1), (8, "SCHEDULED", -timedelta(days=3), "NOT_DUE", 2, 3), (14, "SCHEDULED", -timedelta(hours=2), "NOT_DUE", 4, 5),
                                                         (21, "COMPLETED", -timedelta(days=6), "SUBMITTED", 0, 3), (27, "COMPLETED", -timedelta(days=9), "REVIEWED", 1, 4)], 1):
        vid = sid("visit", n); aid = sid("app", app_i)
        db.add(EvcVisit(id=vid, reference=f"EVC-{n:03d}", application_id=aid, status=status, scheduled_for=now + off, report_status=rep, scheduled_by=sid("regional", app_i % 5))); db.flush()
        for m in (m1, m2): db.add(EvcAssignment(visit_id=vid, member_id=sid("evc", m), application_id=aid))
        if rep in ("SUBMITTED", "REVIEWED"):
            db.add(EvcReport(visit_id=vid, application_id=aid, observations="Seeded demo observations: facilities broadly consistent with the application.", recommendation="Seeded demo recommendation: proceed to committee review.",
                             submitted_by=sid("evc", m1), submitted_at=now + off + day(1), review_note="Reviewed (demo)" if rep == "REVIEWED" else None))
    db.add_all([Notification(user_id=sid("institution", 0), title="Compliance overdue", body="Faculty recruitment undertaking is past its demo due date.", severity="CRITICAL", application_id=sid("app", 0)),
                Notification(user_id=sid("admin", 0), title="Escalations open", body="Several applications are past their demo SLA.", severity="WARNING"),
                Notification(user_id=sid("regional", 0), title="Evidence awaiting review", body="Laboratory setup evidence was submitted.", severity="INFO", application_id=sid("app", 20))])
    db.commit()
