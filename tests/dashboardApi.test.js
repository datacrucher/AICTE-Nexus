import test from 'node:test'
import assert from 'node:assert/strict'
import { createDashboardApi } from '../src/services/dashboardApi.js'
test('dashboard data is passed through with queue rows mapped for the UI', async () => {
  const h = { get: async () => ({ metrics: { total_applications: 3 }, stages: { SCRUTINY: 2 }, regions: [{ name: 'Southern', overdue: 1 }], risk: { HIGH: 1 }, recent: [], queue: [{ id: 'u', reference: 'AICTE-2026-1001', risk_level: 'HIGH', stage: 'SCRUTINY' }] }) }
  const r = await createDashboardApi(h).load(); assert.equal(r.metrics.total_applications, 3); assert.equal(r.queue[0].id, 'AICTE-2026-1001'); assert.deepEqual(r.stages, { SCRUTINY: 2 })
})
test('the nav badge reads the critical alert count; failures are not hidden', async () => {
  assert.equal(await createDashboardApi({ get: async () => ({ critical_alerts: 29 }) }).criticalAlerts(), 29)
  await assert.rejects(createDashboardApi({ get: async () => { throw new Error('Not authenticated') } }).load(), /Not authenticated/)
})
