from datetime import timedelta
from pathlib import Path
import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from .. import audit, rules
from ..db import get_db
from ..models import Application, AuditEvent, Document, EvcAssignment, EvcVisit, Institution, Observation, Region, StageHistory, User, WorkflowAction
from ..queries import STAFF, app_filter, can_see, overview_rows, staff_names
from ..schemas import ApplicationCreateIn, TransitionIn, clean
from ..security import create_document_download_token, current_user, decode_document_download_token

router = APIRouter(tags=["applications"]); PAGE = 10
def _like(q: str) -> str: return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"

@router.get("/applications")
def list_applications(page: int = Query(0, ge=0, le=100000), q: str = Query("", max_length=100), stage: str = Query("", max_length=40), region: str = Query("", max_length=64),
                      sla: str = Query("", pattern=r"^(ON_TRACK|AT_RISK|OVERDUE|DONE|N/A)?$"), risk: str = Query("", pattern=r"^(LOW|MEDIUM|HIGH|CRITICAL)?$"), institution: str = Query("", max_length=200),
                      user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = (select(Application).join(Institution, Institution.id == Application.institution_id).join(Region, Region.code == Application.region_code)
            .outerjoin(User, User.id == Application.assigned_officer_id).where(app_filter(user)))
    if stage: stmt = stmt.where(Application.stage == stage)
    if region: stmt = stmt.where(Region.name == region)
    if institution: stmt = stmt.where(Institution.name == institution)
    if q.strip():
        like = _like(q.strip()); conds = [Application.reference.ilike(like, escape="\\"), Institution.name.ilike(like, escape="\\"), Region.name.ilike(like, escape="\\")]
        if user.role in STAFF: conds.append(User.full_name.ilike(like, escape="\\"))   # institutions cannot search by officer name
        stmt = stmt.where(or_(*conds))
    rows = overview_rows(db, list(db.scalars(stmt.order_by(Application.reference)).unique()), user)
    if sla: rows = [r for r in rows if r["sla_status"] == sla]
    if risk: rows = [r for r in rows if r["risk_level"] == risk]
    return {"rows": rows[page * PAGE:(page + 1) * PAGE], "total": len(rows)}

@router.get("/applications/lookups")
def lookups(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "admin": return {"institutions": sorted(db.scalars(select(Institution.name))), "regions": sorted(db.scalars(select(Region.name)))}
    rows = overview_rows(db, list(db.scalars(select(Application).where(app_filter(user)))), user)
    return {"institutions": sorted({r["institution_name"] for r in rows}), "regions": sorted({r["region_name"] for r in rows})}

def _app(db: Session, user: User, ref: str) -> Application:
    a = db.scalar(select(Application).where(or_(Application.id == ref, Application.reference == ref), app_filter(user)))
    if not a: raise HTTPException(404, "Application not found")   # 404 (not 403) so existence of hidden records is not revealed
    return a



@router.post("/applications", status_code=201)
def create_application(body: ApplicationCreateIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Create a fictional demo application for the authenticated institution."""
    if user.role != "institution" or not user.institution_id:
        raise HTTPException(403, "Only institution accounts can submit applications.")
    inst = db.get(Institution, user.institution_id)
    if not inst:
        raise HTTPException(400, "The institution profile is not configured.")
    now = rules.utcnow()
    # References are human-readable; the database unique constraint remains the final guard.
    existing = list(db.scalars(select(Application.reference)))
    nums = []
    for ref in existing:
        try:
            nums.append(int(ref.rsplit("-", 1)[1]))
        except (ValueError, IndexError):
            continue
    next_num = max(nums, default=994) + 7
    reference = f"AICTE-2026-{next_num}"
    reviewer = db.scalar(select(User).where(User.role == "scrutiny", User.is_active).order_by(User.email))
    app_row = Application(reference=reference, institution_id=inst.id, region_code=inst.region_code,
                          application_type=body.application_type, stage="SUBMITTED", stage_started_at=now,
                          submitted_at=now, assigned_officer_id=reviewer.id if reviewer else None, priority="Normal", created_by=user.id)
    db.add(app_row); db.flush()
    db.add(StageHistory(application_id=app_row.id, from_stage=None, to_stage="SUBMITTED", changed_by=user.id,
                        remarks=clean(body.remarks) or "Submitted through AICTE Nexus demo workflow", created_at=now))
    audit.record(db, user, "Application submitted", app_row.id, "applications", reference, "DRAFT", "SUBMITTED",
                 clean(body.remarks) or "Submitted through AICTE Nexus demo workflow")
    db.commit(); db.refresh(app_row)
    return overview_rows(db, [app_row], user)[0]


@router.get("/applications/{ref}")
def get_application(ref: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return overview_rows(db, [_app(db, user, ref)], user)[0]

@router.get("/applications/{ref}/detail")
def application_detail(ref: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _app(db, user, ref); inst_view = user.role == "institution"
    hist = list(db.scalars(select(StageHistory).where(StageHistory.application_id == a.id).order_by(StageHistory.created_at, StageHistory.id)))
    events = list(db.scalars(select(AuditEvent).where(AuditEvent.application_id == a.id).order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc())))
    if inst_view: events = [e for e in events if e.target_type != "escalations"]
    names = staff_names(db, [h.changed_by for h in hist] + [e.actor_id for e in events], user)
    inst_users = set(db.scalars(select(User.id).where(User.role == "institution"))) if inst_view else set()
    ts = lambda d: int(rules.aware(d).timestamp() * 1000)
    timeline = []
    for h in hist:
        hide = inst_view and h.changed_by not in inst_users
        timeline.append({"id": h.id, "ts": ts(h.created_at), "actor": "System / user" if hide else names.get(h.changed_by, "System / user"), "action": "Stage changed" if h.from_stage else "Application created",
                         "to": h.to_stage, "remarks": None if hide else h.remarks, "simulated": h.remarks == "Seeded demo event"})
    audit_rows = []
    for e in events:
        hide = inst_view and e.actor_role != "institution"
        audit_rows.append({"id": e.id, "ts": ts(e.occurred_at), "actor": e.actor_role or "system" if hide else names.get(e.actor_id) or e.actor_role or "system", "role": e.actor_role, "action": e.action,
                           "from": e.from_value or "—", "to": e.to_value or "—", "remarks": "—" if hide else (e.remarks or "—"), "simulated": e.is_seed})
    obs = db.scalars(select(Observation).where(Observation.application_id == a.id).order_by(Observation.seq))
    docs = db.scalars(select(Document).where(Document.application_id == a.id).order_by(Document.doc_type))
    return {"observations": [{"n": o.seq, "text": o.body, "status": o.status} for o in obs], "timeline": timeline, "audit": audit_rows,
            "documents": [{"id": d.id, "doc_type": d.doc_type, "expiry_date": d.expiry_date.isoformat() if d.expiry_date else None, "verification_status": d.verification_status, "file_name": d.file_name, "has_file": bool(d.storage_path)} for d in docs]}

@router.get("/workflow/actions")
def workflow_actions(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return [{"action_id": w.action_id, "role": w.role, "label": w.label, "from_stage": w.from_stage, "to_stage": w.to_stage} for w in db.scalars(select(WorkflowAction))]

@router.post("/applications/{app_id}/transition")
def transition(app_id: str, body: TransitionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = db.scalar(select(Application).where(or_(Application.id == app_id, Application.reference == app_id)).with_for_update())
    if not a or not can_see(db, user, a.id): raise HTTPException(404, "Application not found")
    wa = db.get(WorkflowAction, (body.action, user.role)); note = clean(body.remarks)
    if not wa or wa.from_stage != a.stage: raise HTTPException(403, f"Action {body.action} is not permitted for role {user.role} in stage {a.stage}")
    open_obs = list(db.scalars(select(Observation).where(Observation.application_id == a.id, Observation.status == "OPEN")))
    if body.action == "complete" and open_obs: raise HTTPException(409, "Close all observations first")
    if body.action == "raise":
        seq = (db.scalar(select(Observation.seq).where(Observation.application_id == a.id).order_by(Observation.seq.desc())) or 0) + 1
        db.add(Observation(application_id=a.id, seq=seq, body=note or "Observation raised by scrutiny officer", raised_by=user.id))
    if body.action == "respond":
        for o in open_obs: o.status, o.response_text, o.responded_at = "RESPONDED", note, rules.utcnow()
    old = a.stage; a.stage, a.stage_started_at = wa.to_stage, rules.utcnow()
    db.add(StageHistory(application_id=a.id, from_stage=old, to_stage=a.stage, changed_by=user.id, remarks=note))
    audit.record(db, user, "Stage changed", a.id, "applications", a.reference, old, a.stage, note)
    # End-to-end demo bridge: when scrutiny completes, create a scheduled demo EVC visit
    # and assign an EVC member so the EVC role can see and process this application.
    if body.action == "complete":
        member = db.scalar(select(User).where(User.role == "evc", User.is_active).order_by(User.email))
        if member:
            visit = EvcVisit(reference=f"EVC-{a.reference[-4:]}", application_id=a.id, status="SCHEDULED",
                             scheduled_for=rules.utcnow() + timedelta(days=1), report_status="NOT_DUE", scheduled_by=user.id)
            db.add(visit); db.flush()
            db.add(EvcAssignment(visit_id=visit.id, member_id=member.id, application_id=a.id))
            audit.record(db, user, "EVC visit prepared for demo", a.id, "evc_visits", visit.reference, None, "SCHEDULED",
                         "Demo visit placeholder created; confirm scheduling in the EVC workspace.")
    if body.action == "complete_visit":
        visit = db.scalar(select(EvcVisit).where(EvcVisit.application_id == a.id, EvcVisit.status == "SCHEDULED").order_by(EvcVisit.scheduled_for.desc()))
        if visit:
            visit.status = "COMPLETED"; visit.report_status = "SUBMITTED"
    if body.action == "schedule_evc":
        visit = db.scalar(select(EvcVisit).where(EvcVisit.application_id == a.id).order_by(EvcVisit.scheduled_for.desc()))
        if visit:
            visit.scheduled_for = rules.utcnow() + timedelta(days=1)
    db.commit()
    return overview_rows(db, [a], user)[0]


# Local demo document storage. For production, replace with private object storage.
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
ALLOWED_DOCUMENT_TYPES = {"FACULTY", "INFRASTRUCTURE", "AFFIDAVIT", "APPROVAL", "OTHER"}


@router.post("/applications/{ref}/documents", status_code=201)
async def upload_document(
    ref: str,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if user.role != "institution" or not user.institution_id:
        raise HTTPException(403, "Only institution accounts can upload documents.")
    application = _app(db, user, ref)
    if application.institution_id != user.institution_id:
        raise HTTPException(404, "Application not found.")
    doc_type = doc_type.strip().upper()
    if doc_type not in ALLOWED_DOCUMENT_TYPES:
        raise HTTPException(422, "Choose a valid document type.")
    original_name = Path(file.filename or "document.pdf").name
    if not original_name.lower().endswith(".pdf"):
        raise HTTPException(415, "Only PDF files are supported.")
    content = await file.read(MAX_DOCUMENT_BYTES + 1)
    if len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(413, "Maximum document size is 10 MB.")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(415, "The uploaded file does not appear to be a valid PDF.")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_path = UPLOAD_DIR / f"{uuid.uuid4().hex}.pdf"
    try:
        stored_path.write_bytes(content)
        doc = Document(
            application_id=application.id,
            institution_id=user.institution_id,
            doc_type=doc_type,
            file_name=original_name[:255],
            storage_path=str(stored_path.resolve()),
            verification_status="PENDING",
        )
        db.add(doc)
        db.flush()
        audit.record(db, user, "Document uploaded", application.id, "documents", doc.id,
                     None, "PENDING", f"Uploaded {original_name[:200]}")
        db.commit()
        db.refresh(doc)
        return {"id": doc.id, "application_id": doc.application_id, "doc_type": doc.doc_type,
                "file_name": doc.file_name, "verification_status": doc.verification_status}
    except Exception:
        db.rollback()
        stored_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


def _document_file(db: Session, application: Application, document_id: str):
    doc = db.scalar(select(Document).where(
        Document.id == document_id, Document.application_id == application.id
    ))
    if not doc or not doc.storage_path:
        raise HTTPException(404, "Document not found.")
    path = Path(doc.storage_path).resolve()
    if path.parent != UPLOAD_DIR.resolve() or not path.is_file():
        raise HTTPException(404, "Stored document not found.")
    return FileResponse(path=str(path), media_type="application/pdf",
                        filename=doc.file_name or "document.pdf",
                        content_disposition_type="attachment")


@router.get("/applications/{ref}/documents/{document_id}/download")
def download_document_authenticated(
    ref: str,
    document_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    # Keep the authenticated API route available for non-browser clients.
    application = _app(db, user, ref)
    return _document_file(db, application, document_id)


@router.post("/applications/{ref}/documents/{document_id}/download-ticket")
def create_download_ticket(
    ref: str,
    document_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    application = _app(db, user, ref)
    doc = db.scalar(select(Document).where(Document.id == document_id, Document.application_id == application.id))
    if not doc or not doc.storage_path:
        raise HTTPException(404, "Document not found.")
    path = Path(doc.storage_path).resolve()
    if path.parent != UPLOAD_DIR.resolve() or not path.is_file():
        raise HTTPException(404, "Stored document not found.")
    return {"ticket": create_document_download_token(user.id, application.id, doc.id)}


@router.post("/applications/{ref}/documents/{document_id}/download")
def download_document(
    ref: str,
    document_id: str,
    ticket: str = Form(...),
    db: Session = Depends(get_db),
):
    claims = decode_document_download_token(ticket)
    if claims["doc"] != document_id:
        raise HTTPException(404, "Document not found.")
    application = db.get(Application, claims["app"])
    user = db.get(User, claims["sub"])
    if not application or (ref not in {application.id, application.reference}) or not user or not user.is_active:
        raise HTTPException(404, "Document not found.")
    if not can_see(db, user, application.id):
        raise HTTPException(404, "Document not found.")
    return _document_file(db, application, document_id)


@router.post("/applications/{ref}/documents/{document_id}/verify")
def verify_document(
    ref: str,
    document_id: str,
    body: dict,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if user.role not in {"admin", "regional", "scrutiny"}:
        raise HTTPException(403, "Only authorized reviewers can verify documents.")
    application = _app(db, user, ref)
    doc = db.scalar(select(Document).where(
        Document.id == document_id, Document.application_id == application.id
    ))
    if not doc:
        raise HTTPException(404, "Document not found.")
    status = body.get("status")
    if status not in {"VERIFIED", "REJECTED"}:
        raise HTTPException(422, "Status must be VERIFIED or REJECTED.")
    previous = doc.verification_status
    doc.verification_status = status
    audit.record(db, user, "Document verification updated", application.id,
                 "documents", doc.id, previous, status)
    db.commit()
    return {"id": doc.id, "verification_status": doc.verification_status}
