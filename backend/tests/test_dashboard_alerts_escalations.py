from .conftest import hdr
def dash(c, role, n=0): return c.get("/api/dashboard", headers=hdr(c, role, n)).json()
def esc(c, role, n=0): return c.get("/api/escalations", headers=hdr(c, role, n))

def test_admin_metrics_match_the_original_seeded_numbers(client):
    m = dash(client, "admin")["metrics"]
    assert (m["total_applications"], m["pending_applications"], m["approved_applications"], m["overdue_applications"], m["open_escalations"], m["overdue_compliance"], m["upcoming_evc_visits"], m["pending_evc_reports"], m["critical_alerts"]) == (30, 30, 0, 17, 17, 3, 1, 0, 29)
def test_metrics_are_scoped_per_role(client):
    assert dash(client, "institution")["metrics"]["total_applications"] == 3 and dash(client, "institution")["metrics"]["open_escalations"] == 0
    assert dash(client, "regional")["metrics"]["total_applications"] == 6 and dash(client, "evc")["metrics"]["total_applications"] == 2 and dash(client, "evc")["metrics"]["upcoming_evc_visits"] == 1
    for r, n in (("admin", 0), ("regional", 0), ("scrutiny", 0), ("institution", 0), ("evc", 0)):
        d = dash(client, r, n); assert sum(d["stages"].values()) == d["metrics"]["total_applications"] == sum(d["risk"].values()) and sum(x["overdue"] for x in d["regions"]) == d["metrics"]["overdue_applications"]
def test_queue_and_recent_activity(client):
    d = dash(client, "admin"); assert 0 < len(d["queue"]) <= 8 and all(a["sla_status"] in ("OVERDUE", "AT_RISK") for a in d["queue"]) and [a["risk_score"] for a in d["queue"]] == sorted((a["risk_score"] for a in d["queue"]), reverse=True)
    assert len(d["recent"]) == 8 and all(e["reference"] for e in d["recent"])
def test_critical_alert_count_is_identical_everywhere(client):
    for r, n in (("admin", 0), ("regional", 0), ("scrutiny", 0), ("institution", 0), ("evc", 0)):
        h = hdr(client, r, n); al = client.get("/api/alerts", headers=h).json()["alerts"]; n_crit = sum(a["severity"] == "CRITICAL" for a in al)
        assert n_crit == client.get("/api/dashboard", headers=h).json()["metrics"]["critical_alerts"] == client.get("/api/dashboard/critical-alerts", headers=h).json()["critical_alerts"], r
def test_alert_content_and_scope(client):
    al = client.get("/api/alerts", headers=hdr(client, "admin", 0)).json()["alerts"]; types = {a["type"] for a in al}; assert {"OVERDUE", "DOCUMENT", "COMPLIANCE", "EVC"} <= types
    assert all(a["why"].startswith("Rule:") and a["officer"] and a["appId"].startswith("AICTE-") for a in al)
    inst = client.get("/api/alerts", headers=hdr(client, "institution", 0)).json()["alerts"]; assert inst and {a["institution"] for a in inst} == {"Sri Venkateswara Institute of Technology"} and len(inst) < len(al)
def test_escalations_are_restricted_by_role(client):
    assert esc(client, "institution").status_code == 403 and esc(client, "evc").status_code == 403 and esc(client, "admin").status_code == 200
    assert len(esc(client, "admin").json()["rows"]) == 17 and 0 < len(esc(client, "regional").json()["rows"]) < 17 and {r["app"]["region_name"] for r in esc(client, "regional").json()["rows"]} == {"Southern"}
def test_escalation_actions_permissions_validation_and_audit(client):
    row = next(r for r in esc(client, "regional").json()["rows"] if r["status"] == "OPEN"); url = f"/api/escalations/{row['id']}/act"
    post = lambda role, n, body: client.post(url, headers=hdr(client, role, n), json=body)
    assert post("regional", 0, {"kind": "resolve", "remarks": "x"}).status_code == 403 and post("institution", 0, {"kind": "acknowledge"}).status_code in (403, 404)
    assert post("regional", 0, {"kind": "bogus"}).status_code == 422
    assert post("regional", 0, {"kind": "acknowledge", "remarks": "regional noted"}).json()["status"] == "ACKNOWLEDGED" and post("regional", 0, {"kind": "acknowledge"}).status_code == 409
    assert post("admin", 0, {"kind": "resolve", "remarks": "  "}).status_code == 422
    before = dash(client, "admin")["metrics"]["open_escalations"]
    assert post("admin", 0, {"kind": "resolve", "remarks": "handled"}).json()["status"] == "RESOLVED" and post("admin", 0, {"kind": "resolve", "remarks": "again"}).status_code == 409
    assert dash(client, "admin")["metrics"]["open_escalations"] == before - 1
    h = [x for x in esc(client, "admin").json()["history"] if x["reference"] == row["app"]["reference"]]
    assert {(x["to_value"], x["actor_role"]) for x in h} >= {("ACKNOWLEDGED", "regional"), ("RESOLVED", "admin")} and any(x["remarks"] == "regional noted" for x in h)
def test_scrutiny_can_view_but_not_act(client):
    r = esc(client, "scrutiny", 0).json()["rows"]
    if r: assert client.post(f"/api/escalations/{r[0]['id']}/act", headers=hdr(client, "scrutiny", 0), json={"kind": "acknowledge"}).status_code == 403
