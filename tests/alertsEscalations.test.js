import test from 'node:test'
import assert from 'node:assert/strict'
import { createAlertsApi } from '../src/services/alertsApi.js'
import { createEscalationsApi } from '../src/services/escalationsApi.js'
test('alerts are returned as evaluated by the backend', async () => { assert.deepEqual(await createAlertsApi({ get: async (p) => (p === '/alerts' ? { alerts: [{ id: 'x', severity: 'CRITICAL' }], truncated: false } : null) }).load(), { alerts: [{ id: 'x', severity: 'CRITICAL' }], truncated: false }) })
test('escalation rows map their application for the existing page', async () => {
  const r = await createEscalationsApi({ get: async () => ({ rows: [{ id: 'e1', level: 3, status: 'OPEN', app: { id: 'u', reference: 'AICTE-2026-1015', stage: 'FINAL_REVIEW', risk_level: 'HIGH' } }], history: [{ id: 1 }] }) }).list()
  assert.equal(r.rows[0].app.id, 'AICTE-2026-1015'); assert.equal(r.history.length, 1)
})
test('escalation actions post to the backend and surface permission errors', async () => {
  const calls = []; await createEscalationsApi({ post: async (p, b) => { calls.push([p, b]); return {} } }).act('e1', 'acknowledge', 'noted'); assert.deepEqual(calls[0], ['/escalations/e1/act', { kind: 'acknowledge', remarks: 'noted' }])
  await assert.rejects(createEscalationsApi({ post: async () => { throw new Error('Role regional may not resolve escalations') } }).act('e1', 'resolve', 'r'), /may not resolve/)
})
