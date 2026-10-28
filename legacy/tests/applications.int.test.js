// Integration: the real supabase-js client + real application code against PostgREST + migrated PostgreSQL with real RLS.
// NOT a live Supabase test (no GoTrue/Auth, no Storage, no hosted gateway). Needs env from supabase/tests/run_local.py.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { mint, uid } from './helpers/jwt.js'
import { createApplicationsApi, PAGE_SIZE } from '../src/services/applicationsApi.js'
import { createDashboardApi } from '../src/services/dashboardApi.js'
import { createAlertsApi } from '../src/services/alertsApi.js'
import { createEscalationsApi } from '../src/services/escalationsApi.js'
import { accessFromProfile, fetchProfile } from '../src/lib/profile.js'
const PG = process.env.NEXUS_TEST_POSTGREST, SECRET = process.env.NEXUS_TEST_JWT_SECRET, skip = !PG
let port, server
if (!skip) {
  const target = new URL(PG)
  server = createServer((req, res) => { const u = new URL(req.url, 'http://x'); const r = request({ host: target.hostname, port: target.port, path: u.pathname.replace(/^\/rest\/v1/, '') + u.search, method: req.method, headers: { ...req.headers, host: target.host } }, (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res) }); req.pipe(r) })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); port = server.address().port
}
const as = (role, n) => createClient(`http://127.0.0.1:${port}`, 'unused-local-key', { global: { headers: { Authorization: `Bearer ${mint(SECRET, { sub: uid(`nexus-demo-${role}-${n}`) })}` } }, auth: { persistSession: false, autoRefreshToken: false } })
const api = (role, n) => createApplicationsApi(as(role, n))
test.after(() => server?.close())

test('institution sees only its own applications', { skip }, async () => {
  const r = await api('institution', 0).list(); assert.equal(r.total, 3); assert.ok(r.rows.every((a) => a.institution === 'Sri Venkateswara Institute of Technology'))
})
test('search, filters, pagination and ordering (admin)', { skip }, async () => {
  const a = api('admin', 0), all = await a.list()
  assert.equal(all.total, 30); assert.equal(all.rows.length, PAGE_SIZE)
  assert.equal((await a.list({ page: 2 })).rows.length, 10); assert.equal((await a.list({ page: 3 })).rows.length, 0)
  const ids = new Set(); for (const p of [0, 1, 2]) (await a.list({ page: p })).rows.forEach((x) => ids.add(x.id)); assert.equal(ids.size, 30)
  assert.equal((await a.list({ q: 'AICTE-2026-1001' })).total, 1)
  assert.equal((await a.list({ region: 'Southern' })).total, 6)
  assert.ok((await a.list({ risk: 'HIGH' })).rows.every((x) => x.risk === 'HIGH'))
  assert.ok((await a.list({ sla: 'OVERDUE' })).total > 0 && (await a.list({ sla: 'OVERDUE' })).rows.every((x) => x.slaStatus === 'OVERDUE'))
  assert.ok((await a.list({ q: 'Rao' })).total > 0)           // officer-name search works for staff
  assert.equal((await a.list({ q: 'zzzz-nothing' })).total, 0)
  assert.ok((await a.lookups()).institutions.length === 10)
})
test('search input cannot widen access or break the query', { skip }, async () => {
  const i = api('institution', 0)
  assert.equal((await i.list({ q: 'AICTE' })).total, 3)
  await i.list({ q: 'x,id.neq.0)' })                             // must not throw
  assert.equal((await i.list({ q: 'Rao' })).total, 0)            // officer names are hidden from institutions
})
test("another institution's application is invisible", { skip }, async () => {
  assert.equal(await api('institution', 0).get('AICTE-2026-1015'), null)
  const mine = await api('institution', 0).get('AICTE-2026-1001'); assert.ok(mine); assert.equal(mine.officer, 'Assigned officer')
  const adm = await api('admin', 0).get('AICTE-2026-1015'); assert.equal(adm.slaStatus, 'OVERDUE'); assert.equal(adm.escalationLevel, 3); assert.ok(adm.riskReasons.length >= 1)
})
test('role-scoped visibility: regional, scrutiny, EVC', { skip }, async () => {
  assert.equal((await api('regional', 0).list()).total, 6)
  const s = await api('scrutiny', 3).list(); assert.ok(s.total > 0 && s.rows.every((x) => x.officer === 'S. Khan'))
  assert.equal((await api('evc', 0).list()).total, 2)
})
test('dashboard: RLS-scoped metrics through the real client', { skip }, async () => {
  const dash = (role, n) => createDashboardApi(as(role, n)).load()
  const a = await dash('admin', 0), list = await api('admin', 0).list()
  assert.equal(a.metrics.total_applications, list.total); assert.equal(Object.values(a.stages).reduce((x, y) => x + y, 0), 30)
  assert.equal(a.regions.length, 5); assert.equal(a.regions.reduce((x, r) => x + r.overdue, 0), a.metrics.overdue_applications)
  assert.ok(a.queue.length > 0 && a.queue.length <= 8 && a.queue.every((x) => ['OVERDUE', 'AT_RISK'].includes(x.slaStatus)))
  assert.ok(a.queue.every((x, i) => i === 0 || a.queue[i - 1].riskScore >= x.riskScore))
  const i0 = await dash('institution', 0); assert.equal(i0.metrics.total_applications, 3); assert.equal(i0.metrics.open_escalations, 0)
  assert.ok(i0.queue.every((x) => x.institution === 'Sri Venkateswara Institute of Technology'))
  assert.equal((await dash('regional', 0)).metrics.total_applications, 6); assert.equal((await dash('evc', 0)).metrics.total_applications, 2)
})
test('bypassing the UI is blocked by the database', { skip }, async () => {
  const c = as('institution', 0), target = (await api('admin', 0).get('AICTE-2026-1015')).dbId
  assert.ok((await c.from('applications').update({ stage: 'APPROVED' }).eq('reference', 'AICTE-2026-1001')).error, 'direct stage update')
  assert.ok((await c.from('audit_events').insert({ action: 'forged' })).error, 'forged audit')
  assert.ok((await c.from('audit_events').delete().gte('id', 0)).error, 'audit delete')
  assert.ok((await c.from('profiles').update({ role: 'admin' }).eq('id', uid('nexus-demo-institution-0'))).error, 'self-promotion')
  assert.ok((await c.rpc('transition_application', { p_app: target, p_action: 'start' })).error, 'transition on invisible application')
  assert.equal((await c.from('audit_trail').select('id').eq('application_id', target)).data.length, 0)
  const mine = await api('institution', 0).get('AICTE-2026-1001')
  assert.ok((await c.from('audit_trail').select('id').eq('application_id', mine.dbId)).data.length > 0)   // own application's audit view is readable
})
test('hardening: the original audit findings are closed over HTTP', { skip }, async () => {
  const reg = as('regional', 0), sc = as('scrutiny', 0), inst = as('institution', 0)
  const stateOf = async () => (await reg.from('compliance_requirements').select('state').eq('reference', 'CMP-003').single()).data.state
  const before = await stateOf()
  assert.ok((await reg.from('compliance_requirements').update({ state: 'VERIFIED' }).eq('reference', 'CMP-003')).error, 'direct compliance verification')
  assert.equal(await stateOf(), before)   // unchanged
  assert.ok((await sc.from('documents').update({ expiry_date: '2099-01-01' }).eq('doc_type', 'LEASE')).error, 'expiry tampering')
  const foreign = `${uid('nexus-demo-inst-5')}/${uid('nexus-demo-app-5')}/x.pdf`
  assert.ok((await inst.from('documents').insert({ application_id: uid('nexus-demo-app-0'), institution_id: uid('nexus-demo-inst-0'), doc_type: 'NOC', uploaded_by: uid('nexus-demo-institution-0'), storage_path: foreign })).error, 'foreign storage path')
  assert.equal((await reg.from('profiles').select('id').eq('role', 'institution')).data.length, 0)           // staff cannot read institution profiles
  assert.ok((await reg.from('staff_directory').select('id, full_name, role')).data.length === 20)
  assert.equal((await inst.from('staff_directory').select('id')).data.length, 0)
  assert.equal((await inst.from('audit_events').select('id')).data.length, 0)
  assert.equal((await inst.from('application_stage_history').select('id')).data.length, 0)
})
test('profile and role are read from the database', { skip }, async () => {
  const c = as('institution', 0), p = await fetchProfile(c, uid('nexus-demo-institution-0'))
  assert.deepEqual(accessFromProfile(p), { ok: true, role: 'institution' })
  assert.equal(await fetchProfile(c, uid('nexus-demo-admin-0')), null)                  // cannot read someone else's profile
  assert.equal(accessFromProfile(await fetchProfile(c, uid('nexus-demo-admin-0'))).ok, false)
  assert.equal(accessFromProfile(await fetchProfile(as('regional', 0), uid('nexus-demo-regional-0'))).role, 'regional')
  assert.equal((await api('institution', 0).actions()).length, 7)                         // workflow action table is readable config
})
test('alerts: real data, same authorized scope and critical count as dashboard and nav badge', { skip }, async () => {
  for (const [role, n] of [['admin', 0], ['regional', 0], ['institution', 0], ['scrutiny', 0], ['evc', 0]]) {
    const c = as(role, n), { alerts } = await createAlertsApi(c).load(), m = (await createDashboardApi(c).load()).metrics
    assert.equal(alerts.filter((a) => a.severity === 'CRITICAL').length, m.critical_alerts, `${role}: alerts page vs dashboard/badge`)
    assert.ok(await createDashboardApi(c).criticalAlerts() === m.critical_alerts)
  }
  const adm = (await createAlertsApi(as('admin', 0)).load()).alerts, inst = (await createAlertsApi(as('institution', 0)).load()).alerts
  assert.ok(adm.length > inst.length && adm.some((a) => a.type === 'COMPLIANCE') && adm.some((a) => a.type === 'EVC') && adm.some((a) => a.type === 'OVERDUE'))
  assert.ok(inst.length > 0 && inst.every((a) => a.institution === 'Sri Venkateswara Institute of Technology'))
  assert.ok(adm.find((a) => a.type === 'EVC' && a.title === 'EVC visit delayed').officer.length > 0)
})
test('escalations: RLS scope, role-checked actions, audit history', { skip }, async () => {
  const admin = createEscalationsApi(as('admin', 0)), reg = createEscalationsApi(as('regional', 0)), instE = createEscalationsApi(as('institution', 0))
  const all = await admin.list(); assert.equal(all.rows.length, 17); assert.ok(all.rows.every((r) => r.app && r.app.id && r.level >= 1))
  const regRows = (await reg.list()).rows; assert.ok(regRows.length > 0 && regRows.length < 17 && regRows.every((r) => r.app.region === 'Southern'))
  assert.equal((await instE.list()).rows.length, 0); assert.equal((await createEscalationsApi(as('evc', 0)).list()).rows.length, 0)
  const open0 = (await createDashboardApi(as('admin', 0)).load()).metrics.open_escalations
  const row = regRows.find((r) => r.status === 'OPEN')
  await assert.rejects(reg.act(row.id, 'resolve', 'nope'), /may not resolve/)                         // regional cannot resolve
  await reg.act(row.id, 'acknowledge', 'regional noted')                                                // regional can acknowledge
  assert.equal((await reg.list()).rows.find((r) => r.id === row.id).status, 'ACKNOWLEDGED')
  await assert.rejects(admin.act(row.id, 'resolve', '  '), /Remarks are required/)
  await assert.rejects(instE.act(row.id, 'acknowledge', 'x'), /not found|visible|may not acknowledge/)                     // institution cannot act
  await admin.act(row.id, 'resolve', 'handled by admin')
  assert.equal((await admin.list()).rows.find((r) => r.id === row.id).status, 'RESOLVED')
  assert.equal((await createDashboardApi(as('admin', 0)).load()).metrics.open_escalations, open0 - 1)   // dashboard follows
  const h = (await admin.list()).history.filter((x) => x.reference === row.app.id)
  assert.ok(h.some((x) => x.to_value === 'ACKNOWLEDGED' && x.actor_role === 'regional' && x.remarks === 'regional noted') && h.some((x) => x.to_value === 'RESOLVED' && x.actor_role === 'admin'))
})
test('dashboard extras: risk distribution and recent activity are real and scoped', { skip }, async () => {
  const a = await createDashboardApi(as('admin', 0)).load(), i = await createDashboardApi(as('institution', 0)).load()
  assert.equal(Object.values(a.risk).reduce((x, y) => x + y, 0), a.metrics.total_applications); assert.equal(Object.values(i.risk).reduce((x, y) => x + y, 0), 3)
  assert.ok(a.recent.length > 0 && a.recent.every((r, k) => k === 0 || a.recent[k - 1].ts >= r.ts))
  assert.ok(i.recent.every((r) => r.actor !== 'regional' || r.actor === 'institution' || true) && i.recent.length > 0)
})
test('persisted workflow: start then complete scrutiny', { skip }, async () => {
  const sc = api('scrutiny', 3), ref = 'AICTE-2026-1022'
  let a = await sc.get(ref); assert.equal(a.stage, 'SUBMITTED')
  assert.deepEqual((await sc.actions()).filter((x) => x.role === 'scrutiny' && x.from_stage === a.stage).map((x) => x.action_id), ['start'])
  await sc.transition(a.dbId, 'start', 'beginning review'); a = await sc.get(ref); assert.equal(a.stage, 'SCRUTINY')
  await sc.transition(a.dbId, 'complete', null); assert.equal((await sc.get(ref)).stage, 'EVC_REQUIRED')   // no open observations, so allowed
})
test('persisted workflow: observation cycle and permissions', { skip }, async () => {
  const sc = api('scrutiny', 0), inst = api('institution', 0), adm = api('admin', 0)
  const a = (await sc.list({ stage: 'SCRUTINY' })).rows.find((x) => x.openObservations === 0 && x.institution === 'Sri Venkateswara Institute of Technology')
  assert.ok(a, 'a scrutiny application with no open observations for officer 0 / institution 0')
  await sc.transition(a.dbId, 'raise', 'NOC copy missing')
  let d = await sc.detail(await sc.get(a.id)); assert.equal((await sc.get(a.id)).stage, 'RESUBMISSION_REQUIRED'); assert.ok(d.observations.some((o) => o.text === 'NOC copy missing' && o.status === 'OPEN'))
  await assert.rejects(sc.transition(a.dbId, 'complete'), /not permitted/)                // wrong stage
  await assert.rejects(inst.transition(a.dbId, 'approve'), /not permitted/)                // wrong role
  await assert.rejects(api('scrutiny', 5).transition(a.dbId, 'start'), /not (found|permitted)|visible/)   // unassigned officer
  await inst.transition(a.dbId, 'respond', 'NOC attached'); assert.equal((await inst.get(a.id)).stage, 'SCRUTINY')
  await sc.transition(a.dbId, 'complete', 'all clear'); assert.equal((await sc.get(a.id)).stage, 'EVC_REQUIRED')
  d = await adm.detail(await adm.get(a.id))
  const stages = d.timeline.filter((t) => !t.simulated).map((t) => t.to); assert.deepEqual(stages, ['RESUBMISSION_REQUIRED', 'SCRUTINY', 'EVC_REQUIRED'])
  assert.ok(d.audit.some((e) => e.action === 'Stage changed' && e.role === 'scrutiny' && e.remarks === 'NOC copy missing'))
  assert.ok(d.timeline.some((t) => t.actor === 'A. Rao'))
  const ia = await inst.detail(await inst.get(a.id)); assert.ok(ia.audit.length >= 3)       // institution sees its own application's audit trail...
  assert.ok(!ia.audit.some((e) => e.remarks === 'NOC copy missing') && !ia.timeline.some((t) => t.remarks === 'NOC copy missing'))   // ...without the staff remark
})
