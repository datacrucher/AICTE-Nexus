// End-to-end: the REAL frontend service modules against a REAL running backend (HTTP, real auth, real database). Skipped unless NEXUS_TEST_API is set
// (see backend/README or scripts/e2e.sh). State-changing, so it needs a freshly seeded demo database and runs its tests in order.
import test from 'node:test'
import assert from 'node:assert/strict'
import { http, setToken } from '../src/lib/apiClient.js'
import { applicationsApi } from '../src/services/applicationsApi.js'
import { dashboardApi } from '../src/services/dashboardApi.js'
import { alertsApi } from '../src/services/alertsApi.js'
import { escalationsApi } from '../src/services/escalationsApi.js'
import { accessFromProfile } from '../src/lib/profile.js'
const skip = !process.env.NEXUS_TEST_API, PW = process.env.NEXUS_TEST_PASSWORD
const store = new Map(); globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
const as = async (role, n = 0) => { const r = await http.post('/auth/login', { email: `${role}-${n}@nexus-demo.invalid`, password: PW }, { auth: false }); setToken(r.access_token); return r.user }

test('login: role comes from the database; wrong password rejected', { skip }, async () => {
  await assert.rejects(http.post('/auth/login', { email: 'admin-0@nexus-demo.invalid', password: 'wrong-password' }, { auth: false }), /Invalid email or password/)
  const u = await as('institution', 0); assert.deepEqual(accessFromProfile(u), { ok: true, role: 'institution' }); assert.equal((await http.get('/auth/me')).role, 'institution')
  setToken(null); await assert.rejects(applicationsApi.list(), /Not authenticated/)
})
test('institution: scoped applications, dashboard and alerts; no escalations', { skip }, async () => {
  await as('institution', 0)
  const l = await applicationsApi.list(); assert.equal(l.total, 3); assert.equal(await applicationsApi.get('AICTE-2026-1015'), null)
  const d = await dashboardApi.load(); assert.equal(d.metrics.total_applications, 3); assert.equal(d.metrics.open_escalations, 0)
  const al = (await alertsApi.load()).alerts; assert.ok(al.length > 0 && al.every((a) => a.institution === 'Sri Venkateswara Institute of Technology'))
  assert.equal(al.filter((a) => a.severity === 'CRITICAL').length, d.metrics.critical_alerts); assert.equal(await dashboardApi.criticalAlerts(), d.metrics.critical_alerts)
  await assert.rejects(escalationsApi.list(), /not permitted/)
})
test('admin: full scope; the dashboard, alerts and badge agree', { skip }, async () => {
  await as('admin', 0); const l = await applicationsApi.list(), d = await dashboardApi.load()
  assert.equal(l.total, 30); assert.equal(d.metrics.total_applications, 30); assert.equal(d.metrics.open_escalations, 17)
  assert.equal((await alertsApi.load()).alerts.filter((a) => a.severity === 'CRITICAL').length, d.metrics.critical_alerts)
  const a = await applicationsApi.get('AICTE-2026-1015'); assert.equal(a.slaStatus, 'OVERDUE'); assert.equal(a.escalationLevel, 3)
  const det = await applicationsApi.detail(a); assert.ok(det.timeline.length > 0 && det.audit.length > 0 && det.documents.length === 3)
})
test('escalations: regional acknowledges, cannot resolve; admin resolves with remarks; history and counts follow', { skip }, async () => {
  await as('regional', 0); const rows = (await escalationsApi.list()).rows, row = rows.find((r) => r.status === 'OPEN'); assert.ok(rows.length < 17 && rows.every((r) => r.app.region === 'Southern'))
  await assert.rejects(escalationsApi.act(row.id, 'resolve', 'no'), /may not resolve/); await escalationsApi.act(row.id, 'acknowledge', 'regional noted')
  await as('admin', 0); const before = (await dashboardApi.load()).metrics.open_escalations
  await assert.rejects(escalationsApi.act(row.id, 'resolve', ''), /Remarks are required/); await escalationsApi.act(row.id, 'resolve', 'handled')
  assert.equal((await dashboardApi.load()).metrics.open_escalations, before - 1)
  const h = (await escalationsApi.list()).history.filter((x) => x.reference === row.app.id); assert.ok(h.some((x) => x.to_value === 'ACKNOWLEDGED' && x.actor_role === 'regional') && h.some((x) => x.to_value === 'RESOLVED' && x.actor_role === 'admin'))
})
test('workflow through the real UI service layer: start, raise, respond, complete', { skip }, async () => {
  await as('scrutiny', 3); let a = await applicationsApi.get('AICTE-2026-1022'); assert.equal(a.stage, 'SUBMITTED')
  assert.deepEqual((await applicationsApi.actions()).filter((x) => x.role === 'scrutiny' && x.from_stage === a.stage).map((x) => x.action_id), ['start'])
  await applicationsApi.transition(a.dbId, 'start', 'beginning review'); await applicationsApi.transition(a.dbId, 'raise', 'NOC copy missing')
  await as('institution', 3); await assert.rejects(applicationsApi.transition(a.dbId, 'approve'), /not permitted/); await applicationsApi.transition(a.dbId, 'respond', 'NOC attached')
  await as('scrutiny', 3); await applicationsApi.transition(a.dbId, 'complete', 'all clear'); a = await applicationsApi.get('AICTE-2026-1022'); assert.equal(a.stage, 'EVC_REQUIRED')
  const d = await applicationsApi.detail(a); assert.deepEqual(d.timeline.filter((t) => !t.simulated).map((t) => t.to), ['SCRUTINY', 'RESUBMISSION_REQUIRED', 'SCRUTINY', 'EVC_REQUIRED'])
  await as('institution', 3); const di = await applicationsApi.detail(a)
  assert.ok(!JSON.stringify([di.timeline, di.audit]).includes('NOC copy missing') && !JSON.stringify([di.timeline, di.audit]).includes('beginning review'))   // staff remarks are masked for the institution
  assert.ok(di.observations.some((o) => o.text === 'NOC copy missing'))   // ...but the observation itself is addressed to them
  await as('scrutiny', 5); assert.equal(await applicationsApi.get('AICTE-2026-1022'), null)   // an unassigned officer cannot see it
})
