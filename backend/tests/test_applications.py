from .conftest import hdr
def get(c, role, n, path, **kw): return c.get(f"/api{path}", headers=hdr(c, role, n), **kw)
def total(c, role, n, **p): return get(c, role, n, "/applications", params=p).json()["total"]

def test_visibility_is_enforced_per_role(client):
    assert [total(client, r, n) for r, n in (("admin", 0), ("regional", 0), ("scrutiny", 0), ("institution", 0), ("evc", 0))] == [30, 6, 4, 3, 2]
def test_institution_never_sees_other_institutions(client):
    rows = get(client, "institution", 0, "/applications", params={"page": 0}).json()["rows"]; assert {r["institution_name"] for r in rows} == {"Sri Venkateswara Institute of Technology"}
    assert get(client, "institution", 0, "/applications/AICTE-2026-1015").status_code == 404 and get(client, "institution", 0, "/applications/AICTE-2026-1015/detail").status_code == 404
def test_scrutiny_and_regional_scope(client):
    assert all(r["officer_name"] == "S. Khan" for r in get(client, "scrutiny", 3, "/applications").json()["rows"])
    assert {r["region_name"] for r in get(client, "regional", 0, "/applications").json()["rows"]} == {"Southern"}
def test_server_side_sla_and_risk_match_the_original_engine(client):
    a = get(client, "admin", 0, "/applications/AICTE-2026-1001").json(); assert (a["risk_score"], a["risk_level"], a["sla_status"], len(a["risk_reasons"])) == (50, "HIGH", "ON_TRACK", 2)
    b = get(client, "admin", 0, "/applications/AICTE-2026-1015").json(); assert (b["risk_score"], b["risk_level"], b["sla_status"], b["escalation_level"]) == (50, "HIGH", "OVERDUE", 3)
def test_officer_identity_hidden_from_institutions(client):
    assert all(r["officer_name"] is None and r["assigned_officer"] is None for r in get(client, "institution", 0, "/applications").json()["rows"])
    assert total(client, "institution", 0, q="Rao") == 0 and total(client, "admin", 0, q="Rao") > 0
def test_search_filters_and_pagination(client):
    assert total(client, "admin", 0, q="AICTE-2026-1001") == 1 and total(client, "admin", 0, region="Southern") == 6 and total(client, "admin", 0, sla="OVERDUE") == 17
    assert all(r["risk_level"] == "HIGH" for r in get(client, "admin", 0, "/applications", params={"risk": "HIGH"}).json()["rows"])
    ids = {r["id"] for p in range(3) for r in get(client, "admin", 0, "/applications", params={"page": p}).json()["rows"]}; assert len(ids) == 30
    assert get(client, "admin", 0, "/applications", params={"page": 3}).json()["rows"] == []
def test_hostile_search_text_is_harmless(client):
    for q in ("%", "_", "'; drop table applications;--", "x,id.neq.0)", "\\"): assert get(client, "admin", 0, "/applications", params={"q": q}).status_code == 200
    assert total(client, "admin", 0) == 30
def test_invalid_query_values_are_rejected(client):
    assert get(client, "admin", 0, "/applications", params={"sla": "BOGUS"}).status_code == 422 and get(client, "admin", 0, "/applications", params={"page": -1}).status_code == 422
def test_detail_shapes_and_institution_masking(client):
    d = get(client, "admin", 0, "/applications/AICTE-2026-1001/detail").json(); assert {"observations", "documents", "timeline", "audit"} <= d.keys() and len(d["documents"]) == 3 and d["audit"]
    di = get(client, "institution", 0, "/applications/AICTE-2026-1001/detail").json()
    assert all(e["remarks"] == "—" and e["actor"] == "scrutiny" for e in di["audit"] if e["role"] != "institution") and all(t["remarks"] is None for t in di["timeline"])
def test_lookups_are_scoped(client):
    assert len(get(client, "admin", 0, "/applications/lookups").json()["institutions"]) == 10 and get(client, "institution", 0, "/applications/lookups").json()["institutions"] == ["Sri Venkateswara Institute of Technology"]
