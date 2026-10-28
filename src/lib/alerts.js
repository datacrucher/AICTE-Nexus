import { AT_RISK_DAYS, DOC_ALERT_STEPS } from '../config/workflow'
import { fmtDate } from './dates'
const ORD = { CRITICAL: 0, WARNING: 1, INFO: 2 }
const D = (t) => new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
// apps: visible applications. records/visits: enriched compliance and EVC records from the service.
export function buildAlerts(apps, records = [], visits = []) {
  const out = []
  const push = (key, severity, type, title, why, due, appId, institution, officer) => out.push({ id: key, severity, type, title, why, due, appId, institution, officer })
  for (const a of apps) {
    const p = (type, sev, title, why, due) => push(`${a.id}:${type}`, sev, type, title, why, due, a.id, a.institution, a.officer)
    if (a.slaStatus === 'OVERDUE') p('OVERDUE', 'CRITICAL', 'Application overdue', `Rule: days in stage (${a.daysInStage}) exceed the demo SLA of ${a.sla} days for ${a.stage.replace(/_/g, ' ')}.`, fmtDate(a.remaining))
    else if (a.slaStatus === 'AT_RISK') p('DEADLINE', 'WARNING', 'Stage deadline approaching', `Rule: ${a.remaining} day(s) remain; alert starts at ${AT_RISK_DAYS} day(s) or fewer.`, fmtDate(a.remaining))
    if (a.leaseDays < 0) p('DOCUMENT', 'CRITICAL', 'Lease agreement expired', `Rule: expiry date passed ${-a.leaseDays} day(s) ago.`, fmtDate(a.leaseDays))
    else { const s = DOC_ALERT_STEPS.find(([d]) => a.leaseDays <= d); if (s) p('DOCUMENT', s[1], 'Lease agreement expiring', `Rule: expires in ${a.leaseDays} day(s). Demo warning tiers: ${DOC_ALERT_STEPS.map((x) => x[0]).join('/')} days.`, fmtDate(a.leaseDays)) }
    if (a.openObservations) p('ACTION', 'WARNING', `${a.openObservations} observation(s) awaiting response`, 'Rule: open observations remain on the application.', a.remaining == null ? 'n/a' : fmtDate(a.remaining))
  }
  for (const r of records) {
    const p = (sev, title, why, who) => push(`${r.id}:COMPLIANCE`, sev, 'COMPLIANCE', `${title}: ${r.title}`, why, D(r.due), r.appId, r.institution, who)
    if (r.overdue) p('CRITICAL', 'Compliance overdue', `Rule: record ${r.id} passed its due date by ${-r.daysToDue} day(s) without accepted evidence.`, 'Institution')
    else if (r.state === 'REJECTED') p('WARNING', 'Evidence rejected', `Rule: record ${r.id} evidence was rejected; resubmission required before the due date.`, 'Institution')
    else if (r.state === 'SUBMITTED') p('INFO', 'Evidence awaiting verification', `Rule: record ${r.id} evidence was submitted and has not been reviewed.`, r.verifier)
  }
  for (const v of visits) {
    const p = (sev, title, why, who) => push(`${v.id}:EVC`, sev, 'EVC', title, why, D(v.when), v.appId, v.institution, who)
    if (v.status === 'SCHEDULED' && v.delayed) p('WARNING', 'EVC visit delayed', `Rule: visit ${v.id} date has passed and it is not marked completed.`, v.members[0])
    else if (v.status === 'SCHEDULED' && v.when - Date.now() < 3 * 864e5) p('INFO', 'EVC visit approaching', `Rule: visit ${v.id} is within 3 days.`, v.members[0])
    if (v.status === 'COMPLETED' && v.report === 'PENDING') p('WARNING', 'EVC report pending', `Rule: visit ${v.id} is completed but no report is submitted.`, v.members[0])
  }
  return out.sort((x, y) => ORD[x.severity] - ORD[y.severity])
}
