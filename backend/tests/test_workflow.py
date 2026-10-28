from sqlalchemy import select
from app.db import SessionLocal
from app.models import AuditEvent, Observation, StageHistory
from app.seed import sid
from .conftest import hdr
REF, APP = "AICTE-2026-1022", sid("app", 3)   # SUBMITTED, officer scrutiny-3, institution-3
def act(c, role, n, action, remarks=None, app=APP): return c.post(f"/api/applications/{app}/transition", headers=hdr(c, role, n), json={"action": action, "remarks": remarks})
def stage(c): return c.get(f"/api/applications/{REF}", headers=hdr(c, "admin", 0)).json()["stage"]

def test_full_transition_cycle_with_history_and_audit(client):
    assert act(client, "scrutiny", 3, "start", "beginning review").json()["stage"] == "SCRUTINY"
    assert act(client, "scrutiny", 3, "raise", "NOC copy missing").json()["stage"] == "RESUBMISSION_REQUIRED"
    assert act(client, "scrutiny", 3, "complete").status_code == 403                       # wrong stage
    assert act(client, "institution", 3, "respond", "NOC attached").json()["stage"] == "SCRUTINY"
    assert act(client, "scrutiny", 3, "complete", "all clear").json()["stage"] == "EVC_REQUIRED"
    with SessionLocal() as db:
        assert [h.to_stage for h in db.scalars(select(StageHistory).where(StageHistory.application_id == APP, StageHistory.remarks != "Seeded demo event").order_by(StageHistory.id))] == ["SCRUTINY", "RESUBMISSION_REQUIRED", "SCRUTINY", "EVC_REQUIRED"]
        ev = db.scalars(select(AuditEvent).where(AuditEvent.application_id == APP, AuditEvent.is_seed == False)).all()  # noqa: E712
        assert len(ev) == 4 and {e.actor_role for e in ev} == {"scrutiny", "institution"} and any(e.remarks == "NOC copy missing" for e in ev)
        assert db.scalar(select(Observation.status).where(Observation.application_id == APP)) == "RESPONDED"
def test_role_and_stage_checks(client):
    assert act(client, "institution", 3, "approve").status_code == 403 and act(client, "scrutiny", 3, "approve").status_code == 403
    assert act(client, "admin", 0, "start").status_code == 403                              # admin has no scrutiny actions
    assert stage(client) == "SUBMITTED"
def test_users_cannot_act_on_applications_they_cannot_see(client):
    assert act(client, "scrutiny", 5, "start").status_code == 404 and act(client, "institution", 4, "respond").status_code == 404 and act(client, "evc", 0, "start").status_code == 404
    assert stage(client) == "SUBMITTED"
def test_complete_blocked_while_observations_are_open(client):
    act(client, "scrutiny", 3, "start"); act(client, "scrutiny", 3, "raise", "x")
    with SessionLocal() as db: o = db.scalar(select(Observation).where(Observation.application_id == APP)); assert o.status == "OPEN"
    assert act(client, "scrutiny", 3, "complete").status_code == 403
def test_input_validation(client):
    assert act(client, "scrutiny", 3, "Start; DROP").status_code == 422 and act(client, "scrutiny", 3, "start", "x" * 2001).status_code == 422
    assert client.post(f"/api/applications/{APP}/transition", headers=hdr(client, "scrutiny", 3), json={}).status_code == 422
def test_institution_cannot_read_staff_remarks_after_transition(client):
    act(client, "scrutiny", 3, "start", "internal note")
    d = client.get(f"/api/applications/{REF}/detail", headers=hdr(client, "institution", 3)).json()
    assert "internal note" not in str(d) and "internal note" in str(client.get(f"/api/applications/{REF}/detail", headers=hdr(client, "admin", 0)).json())
def test_workflow_actions_and_unauthenticated_transition(client):
    assert len(client.get("/api/workflow/actions", headers=hdr(client, "admin", 0)).json()) == 7
    assert client.post(f"/api/applications/{APP}/transition", json={"action": "start"}).status_code == 401
