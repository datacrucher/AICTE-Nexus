// The server-side overview must agree with the frontend engine that produced the original demo numbers.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dashboardMetrics, listApplications } from '../src/services/applications.js'
const file = process.env.NEXUS_PARITY_JSON
test('SQL overview matches the JS SLA/risk/escalation engine for all 30 seeded applications', { skip: !file }, async () => {
  const db = JSON.parse(readFileSync(file, 'utf8')), js = await listApplications('admin')
  assert.equal(db.length, 30); assert.equal(js.length, 30)
  for (const d of db) { const a = js.find((x) => x.id === d.reference); assert.ok(a, d.reference)
    assert.deepEqual([d.risk_score, d.risk_level, d.sla_status, d.escalation_level], [a.riskScore, a.risk, a.slaStatus, a.escalationLevel], d.reference) }
})
const mfile = process.env.NEXUS_PARITY_METRICS_JSON
test('SQL dashboard_metrics matches the JS engine and mock dashboard for the seeded data (admin)', { skip: !mfile }, async () => {
  const db = JSON.parse(readFileSync(mfile, 'utf8')), apps = await listApplications('admin'), js = await dashboardMetrics('admin')
  assert.deepEqual([db.total_applications, db.pending_applications, db.overdue_applications], [apps.length, apps.filter((a) => a.stage !== 'APPROVED').length, apps.filter((a) => a.slaStatus === 'OVERDUE').length])
  assert.deepEqual([db.open_escalations, db.overdue_compliance, db.upcoming_evc_visits, db.pending_evc_reports, db.critical_alerts], [js.openEscalations, js.overdueCompliance, js.upcomingEvc, js.pendingEvcReports, js.criticalAlerts])
})
