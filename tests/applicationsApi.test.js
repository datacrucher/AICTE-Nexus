import test from 'node:test'
import assert from 'node:assert/strict'
import { createApplicationsApi, toApp } from '../src/services/applicationsApi.js'
const fake = (handler) => { const calls = []; return { calls, get: async (p, q) => { calls.push(['get', p, q]); return handler('get', p, q) }, post: async (p, b) => { calls.push(['post', p, b]); return handler('post', p, b) } } }
const row = { id: 'u1', reference: 'AICTE-2026-1001', institution_name: 'Inst', region_name: 'Southern', stage: 'SCRUTINY', sla_status: 'ON_TRACK', risk_level: 'HIGH', risk_score: 50, risk_reasons: ['a'], officer_name: null, assigned_officer: 'x', lease_days: null, submitted_at: '2026-01-01T00:00:00Z' }
test('list sends filters to the server and maps rows for the existing UI', async () => {
  const h = fake(() => ({ rows: [row], total: 31 })); const r = await createApplicationsApi(h).list({ page: 2, stage: 'SCRUTINY', risk: 'HIGH', q: 'rao' })
  assert.deepEqual(h.calls[0], ['get', '/applications', { page: 2, q: 'rao', stage: 'SCRUTINY', region: '', sla: '', risk: 'HIGH', institution: '' }]); assert.equal(r.total, 31); assert.equal(r.rows[0].id, 'AICTE-2026-1001'); assert.equal(r.rows[0].dbId, 'u1')
})
test('rows map to the shape the pages expect', () => { const a = toApp(row); assert.equal(a.officer, 'Assigned officer'); assert.equal(a.leaseDays, 9999); assert.equal(a.risk, 'HIGH'); assert.deepEqual(a.riskReasons, ['a']) })
test('get returns null for 404 (hidden or missing) and rethrows other errors', async () => {
  const nf = Object.assign(new Error('nf'), { status: 404 }), bad = Object.assign(new Error('boom'), { status: 500 })
  assert.equal(await createApplicationsApi(fake(() => { throw nf })).get('X'), null); await assert.rejects(createApplicationsApi(fake(() => { throw bad })).get('X'), /boom/)
})
test('transition posts to the backend and surfaces its permission errors', async () => {
  const ok = fake(() => ({})); await createApplicationsApi(ok).transition('u1', 'start', 'note'); assert.deepEqual(ok.calls[0], ['post', '/applications/u1/transition', { action: 'start', remarks: 'note' }])
  await assert.rejects(createApplicationsApi(fake(() => { throw new Error('Action approve is not permitted for role institution in stage SCRUTINY') })).transition('u1', 'approve'), /not permitted/)
})
test('detail and actions are plain reads', async () => { const h = fake(() => []); await createApplicationsApi(h).detail({ id: 'AICTE-2026-1001' }); await createApplicationsApi(h).actions(); assert.deepEqual(h.calls.map((c) => c[1]), ['/applications/AICTE-2026-1001/detail', '/workflow/actions']) })
