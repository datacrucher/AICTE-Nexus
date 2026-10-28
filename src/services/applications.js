import { buildApplications, OFFICERS } from '../data/seed'
import { slaFor } from '../lib/sla'
import { scoreRisk } from '../lib/risk'
import { escalationLevel } from '../lib/escalation'
import { STAGES as FLOW } from '../config/workflow'
import { ACTIONS, COMPLIANCE_PERMS, DEMO_INSTITUTION, ESC_ACTIONS, EVC_PERMS, ROLES, visibleTo } from '../config/roles'
import { buildAlerts } from '../lib/alerts'
// All data below is fictional and held in browser memory only; it resets on refresh.
const DAY = 864e5, HOUR = 36e5, OBS = ['Faculty list incomplete', 'Lease agreement needs renewal evidence', 'Building plan approval copy missing']
export const COMMITTEE = ['Dr. N. Prasad', 'Prof. S. Mehta', 'Dr. R. Banerjee', 'Prof. K. Joshi', 'Dr. T. Menon', 'Prof. A. Qureshi']
const COMP_APPS = [0, 10, 20, 1, 6, 11, 3, 7, 12, 15]
const COMP_SEED = [['Faculty recruitment undertaking', -12, 'NOT_SUBMITTED'], ['Fire safety NOC renewal', 5, 'NOT_SUBMITTED'], ['Laboratory setup evidence', 20, 'SUBMITTED'], ['Library resource undertaking', -3, 'REJECTED'], ['Building plan compliance', 40, 'NOT_SUBMITTED'], ['Faculty recruitment undertaking', 12, 'VERIFIED'], ['Lease renewal evidence', -20, 'NOT_SUBMITTED'], ['Fire safety NOC renewal', 8, 'SUBMITTED'], ['Laboratory setup evidence', 30, 'NOT_SUBMITTED'], ['Library resource undertaking', 2, 'NOT_SUBMITTED']]
const OVR = { 7: ['EVC_SCHEDULED', 3], 8: ['EVC_SCHEDULED', 6], 14: ['EVC_SCHEDULED', 1], 21: ['COMMITTEE_REVIEW', 2], 27: ['COMMITTEE_REVIEW', 4] }
let apps, events, comp, visits, seq = 0
const subs = new Set(), esc = {}
const notify = () => subs.forEach((f) => f())
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
const delay = (v) => new Promise((r) => setTimeout(() => r(v), 150))
const daysTo = (ts) => Math.ceil((ts - Date.now()) / DAY)
const isOverdue = (r) => r.due < Date.now() && ['NOT_SUBMITTED', 'REJECTED'].includes(r.state)
const appOf = (id) => apps.find((a) => a.id === id)
const need = (list, role) => { if (!list.includes(role)) throw new Error(`The ${ROLES[role]} demo role is not permitted to do this`) }
const log = (app, role, action, from, to, remarks, target) => events.push({ id: ++seq, ts: Date.now(), app, actor: ROLES[role], role: ROLES[role], action, from, to, remarks: (remarks || '').trim() || '—', target, simulated: false })
function derive(a) {
  const s = slaFor(a.stage, a.daysInStage), open = a.observations.filter((o) => o.status === 'OPEN').length
  const r = scoreRisk({ slaStatus: s.status, remaining: s.remaining, leaseDays: a.leaseDays, openObservations: open, complianceDays: a.complianceDays })
  Object.assign(a, { sla: s.sla, remaining: s.remaining, slaStatus: s.status, openObservations: open, risk: r.level, riskScore: r.score, riskReasons: r.reasons, escalationLevel: escalationLevel(s.status === 'OVERDUE' ? -s.remaining : 0) })
}
// Overdue compliance records feed the application's risk score.
function syncApp(a) { const od = comp.filter((r) => r.appId === a.id && isOverdue(r)); a.complianceDays = od.length ? Math.min(...od.map((r) => daysTo(r.due))) : null; derive(a) }
function init() {
  if (apps) return
  apps = buildApplications().map((a) => ({ ...a, observations: Array.from({ length: a.openObservations }, (_, i) => ({ n: i + 1, text: OBS[i % 3], status: 'OPEN' })) }))
  Object.entries(OVR).forEach(([i, [stage, d]]) => Object.assign(apps[i], { stage, daysInStage: d }))
  events = apps.flatMap((a) => { const idx = Math.max(FLOW.indexOf(a.stage), 0)
    return FLOW.slice(0, idx + 1).map((s, i) => ({ id: ++seq, ts: Date.now() - (a.daysInStage + (idx - i) * 4) * DAY, app: a.id, actor: i ? a.officer : 'Institution', role: i ? 'Officer' : 'Institution', action: i ? 'Stage changed' : 'Application submitted', from: i ? FLOW[i - 1] : 'DRAFT', to: s, remarks: 'Seeded demo event', simulated: true })) })
  comp = COMP_SEED.map(([title, dd, state], k) => { const hist = state === 'NOT_SUBMITTED' ? [] : [{ ts: Date.now() - 5 * DAY, by: 'Institution (seeded)', kind: 'SUBMITTED', fileName: `evidence-${k + 1}.pdf`, note: 'Seeded demo submission' }]
    if (state === 'VERIFIED' || state === 'REJECTED') hist.push({ ts: Date.now() - 2 * DAY, by: 'Regional Officer (seeded)', kind: state, note: state === 'REJECTED' ? 'Evidence illegible; please resubmit' : 'Evidence accepted (demo)' })
    return { id: `CMP-${String(k + 1).padStart(3, '0')}`, appId: apps[COMP_APPS[k]].id, title, due: Date.now() + dd * DAY, state, verifier: OFFICERS[(COMP_APPS[k] + 4) % 8], updated: Date.now() - (state === 'NOT_SUBMITTED' ? 9 : 2) * DAY, history: hist } })
  const mk = (n, i, status, off, members, report) => ({ id: `EVC-${String(n).padStart(3, '0')}`, appId: apps[i].id, status, when: Date.now() + off, members, report, reviewNote: report === 'REVIEWED' ? 'Reviewed (demo)' : null, cancelReason: null, updated: Date.now() + Math.min(off, 0),
    reportData: ['SUBMITTED', 'REVIEWED'].includes(report) ? { observations: 'Seeded demo observations: facilities broadly consistent with the application.', recommendation: 'Seeded demo recommendation: proceed to committee review.', by: members[0], ts: Date.now() + off + DAY } : null })
  visits = [mk(1, 7, 'SCHEDULED', 4 * DAY, [COMMITTEE[0], COMMITTEE[1]], 'NOT_DUE'), mk(2, 8, 'SCHEDULED', -3 * DAY, [COMMITTEE[2], COMMITTEE[3]], 'NOT_DUE'), mk(3, 14, 'SCHEDULED', -2 * HOUR, [COMMITTEE[4], COMMITTEE[5]], 'NOT_DUE'),
    mk(4, 21, 'COMPLETED', -6 * DAY, [COMMITTEE[0], COMMITTEE[3]], 'SUBMITTED'), mk(5, 27, 'COMPLETED', -9 * DAY, [COMMITTEE[1], COMMITTEE[4]], 'REVIEWED')]
  apps.forEach(syncApp)
}
const evcSee = (role, a) => role === 'evc' || (role === 'institution' ? a.institution === DEMO_INSTITUTION : visibleTo(role, a))
const enrichC = (r) => { const a = appOf(r.appId); return { ...r, institution: a.institution, region: a.region, overdue: isOverdue(r), daysToDue: daysTo(r.due), history: [...r.history].sort((x, y) => y.ts - x.ts) } }
const enrichV = (v) => { const a = appOf(v.appId), delayed = v.status === 'SCHEDULED' && v.when < Date.now()
  const outstanding = v.status === 'CANCELLED' ? 'None (cancelled)' : v.status === 'SCHEDULED' ? (delayed ? 'Visit date passed: mark completed' : 'Awaiting visit') : v.report === 'PENDING' ? 'Committee report due' : v.report === 'SUBMITTED' ? 'Report awaiting review' : 'None'
  return { ...v, institution: a.institution, region: a.region, appStage: a.stage, delayed, outstanding } }
const alertsFor = (role) => buildAlerts(apps.filter((a) => visibleTo(role, a)), comp.filter((r) => visibleTo(role, appOf(r.appId))).map(enrichC), visits.filter((v) => evcSee(role, appOf(v.appId))).map(enrichV))
// ---- applications ----
export async function listApplications(role) { init(); return delay(apps.filter((a) => !role || visibleTo(role, a)).map((a) => ({ ...a }))) }
export async function getApplication(id, role) { init(); const a = apps.find((x) => x.id === id); return delay(a && (!role || visibleTo(role, a)) ? { ...a, observations: a.observations.map((o) => ({ ...o })) } : null) }
export async function getEvents(id) { init(); return delay(events.filter((e) => e.app === id).sort((x, y) => y.ts - x.ts)) }
export async function performAction(id, actionId, role, remarks) {
  init()
  const a = apps.find((x) => x.id === id), act = ACTIONS.find((x) => x.id === actionId)
  if (!a || !act) throw new Error('Unknown application or action')
  if (!act.roles.includes(role) || !visibleTo(role, a)) throw new Error('This demo role may not perform that action')
  if (a.stage !== act.from) throw new Error('Application is no longer in the required stage')
  if (actionId === 'complete' && a.observations.some((o) => o.status === 'OPEN')) throw new Error('Close all observations first')
  if (actionId === 'raise') a.observations.push({ n: a.observations.length + 1, text: remarks || 'Observation raised by scrutiny officer', status: 'OPEN' })
  if (actionId === 'respond') a.observations.forEach((o) => { if (o.status === 'OPEN') o.status = 'RESPONDED' })
  const from = a.stage
  Object.assign(a, { stage: act.to, daysInStage: 0 }); syncApp(a)
  log(id, role, act.label, from, act.to, remarks)
  notify()
  return delay({ ...a })
}
// ---- alerts and escalations ----
export async function listAlerts(role) { init(); return delay(alertsFor(role)) }
export async function alertCounts(role) { init(); const l = alertsFor(role); return delay({ total: l.length, critical: l.filter((x) => x.severity === 'CRITICAL').length }) }
export async function listEscalations(role) {
  init()
  return delay(apps.filter((a) => visibleTo(role, a) && (a.escalationLevel > 0 || esc[a.id])).map((a) => ({ ...a, level: a.escalationLevel || esc[a.id]?.level || 0, escStatus: esc[a.id]?.status || 'OPEN',
    history: events.filter((e) => e.app === a.id && e.action.startsWith('Escalation')).sort((x, y) => y.ts - x.ts) })))
}
export async function actOnEscalation(id, kind, role, remarks) {
  init()
  const a = apps.find((x) => x.id === id), def = ESC_ACTIONS[kind], note = (remarks || '').trim()
  if (!a || !def || !visibleTo(role, a)) throw new Error('Unknown or inaccessible escalation')
  if (!def.roles.includes(role)) throw new Error(`The ${ROLES[role]} demo role may not ${kind} escalations`)
  if (!(a.escalationLevel > 0 || esc[id])) throw new Error('No active escalation on this application')
  if (kind === 'resolve' && !note) throw new Error('Remarks are required to resolve an escalation')
  const cur = esc[id]?.status || 'OPEN'
  if (kind === 'acknowledge' && cur !== 'OPEN') throw new Error('Only open escalations can be acknowledged')
  if (kind === 'resolve' && cur === 'RESOLVED') throw new Error('Escalation is already resolved')
  const to = kind === 'acknowledge' ? 'ACKNOWLEDGED' : 'RESOLVED'
  esc[id] = { status: to, level: a.escalationLevel || esc[id]?.level || 0 }
  log(id, role, `Escalation ${kind}d`, cur, to, note)
  notify()
  return delay(true)
}
// ---- compliance ----
export async function listCompliance(role) { init(); return delay(comp.filter((r) => visibleTo(role, appOf(r.appId))).map(enrichC)) }
export async function submitEvidence(id, role, { fileName, fileSize, note }) {
  init(); need(COMPLIANCE_PERMS.submit, role)
  const r = comp.find((x) => x.id === id), a = r && appOf(r.appId)
  if (!r || !visibleTo(role, a)) throw new Error('Record not found or not visible to this role')
  if (!['NOT_SUBMITTED', 'REJECTED'].includes(r.state)) throw new Error('Evidence is already submitted for this requirement')
  if (!fileName) throw new Error('Select a supporting file (only its name and size are kept, in memory)')
  if (fileSize > 5 * 1024 * 1024) throw new Error('File exceeds the 5 MB demo limit')
  const from = r.state
  r.state = 'SUBMITTED'; r.updated = Date.now(); r.history.push({ ts: Date.now(), by: ROLES[role], kind: 'SUBMITTED', fileName, note: (note || '').trim() || '—' })
  log(r.appId, role, 'Compliance evidence submitted', from, 'SUBMITTED', `${fileName}. ${note || ''}`, r.id); syncApp(a); notify(); return delay(true)
}
export async function reviewEvidence(id, role, decision, remarks) {
  init(); need(COMPLIANCE_PERMS.review, role)
  const r = comp.find((x) => x.id === id), a = r && appOf(r.appId), note = (remarks || '').trim()
  if (!r || !visibleTo(role, a)) throw new Error('Record not found or not visible to this role')
  if (!['VERIFIED', 'REJECTED'].includes(decision)) throw new Error('Unknown decision')
  if (r.state === 'NOT_SUBMITTED') throw new Error('Evidence has not been submitted yet, so it cannot be reviewed')
  if (r.state !== 'SUBMITTED') throw new Error('Only submitted evidence awaiting review can be verified or rejected')
  if (decision === 'REJECTED' && !note) throw new Error('Remarks are required when rejecting evidence')
  r.state = decision; r.updated = Date.now(); r.history.push({ ts: Date.now(), by: ROLES[role], kind: decision, note: note || '—' })
  log(r.appId, role, decision === 'VERIFIED' ? 'Compliance evidence verified' : 'Compliance evidence rejected', 'SUBMITTED', decision, note, r.id); syncApp(a); notify(); return delay(true)
}
// ---- EVC ----
const activeVisit = (appId) => visits.find((v) => v.appId === appId && v.status !== 'CANCELLED')
function checkWhen(when, members, exceptId) {
  const t = new Date(when).getTime()
  if (!when || Number.isNaN(t)) throw new Error('Enter a valid visit date and time')
  if (t <= Date.now()) throw new Error('Visit date and time must be in the future')
  if (t > Date.now() + 365 * DAY) throw new Error('Visit cannot be scheduled more than a year ahead (demo limit)')
  const m = [...new Set(members || [])]
  if (m.length < 2) throw new Error('Assign at least two committee members')
  if (m.length > 5) throw new Error('Assign at most five committee members')
  if (m.some((x) => !COMMITTEE.includes(x))) throw new Error('Unknown committee member')
  const clash = visits.find((v) => v.status === 'SCHEDULED' && v.id !== exceptId && Math.abs(v.when - t) < 4 * HOUR && v.members.some((x) => m.includes(x)))
  if (clash) throw new Error(`${clash.members.find((x) => m.includes(x))} is already assigned to ${clash.id} within 4 hours of that time`)
  return [t, m]
}
const visitFor = (id, role) => { const v = visits.find((x) => x.id === id), a = v && appOf(v.appId); if (!v || !evcSee(role, a)) throw new Error('Visit not found or not visible to this role'); return [v, a] }
const must = (s, label) => { const t = (s || '').trim(); if (!t) throw new Error(`${label} is required`); return t }
export async function listEvc(role) {
  init()
  return delay({ visits: visits.filter((v) => evcSee(role, appOf(v.appId))).map(enrichV), eligible: apps.filter((a) => a.stage === 'EVC_REQUIRED' && !activeVisit(a.id) && evcSee(role, a)).map((a) => ({ ...a })) })
}
export async function scheduleVisit(appId, role, { when, members }) {
  init(); need(EVC_PERMS.schedule, role)
  const a = appOf(appId)
  if (!a || !evcSee(role, a)) throw new Error('Application not found or not visible to this role')
  if (a.stage !== 'EVC_REQUIRED') throw new Error('Only applications in the EVC REQUIRED stage can be scheduled')
  if (activeVisit(appId)) throw new Error('This application already has an active visit')
  const [t, m] = checkWhen(when, members)
  const v = { id: `EVC-${String(visits.length + 1).padStart(3, '0')}`, appId, status: 'SCHEDULED', when: t, members: m, report: 'NOT_DUE', reportData: null, reviewNote: null, cancelReason: null, updated: Date.now() }
  visits.push(v); Object.assign(a, { stage: 'EVC_SCHEDULED', daysInStage: 0 }); syncApp(a)
  log(appId, role, 'EVC visit scheduled', 'EVC_REQUIRED', 'EVC_SCHEDULED', `${new Date(t).toLocaleString('en-IN')} with ${m.join(', ')}`, v.id); notify(); return delay(true)
}
export async function rescheduleVisit(id, role, { when, members, reason }) {
  init(); need(EVC_PERMS.schedule, role)
  const [v, a] = visitFor(id, role)
  if (v.status !== 'SCHEDULED') throw new Error('Only scheduled visits can be rescheduled')
  const why = must(reason, 'Reason for rescheduling'), [t, m] = checkWhen(when, members, id)
  v.when = t; v.members = m; v.updated = Date.now()
  log(a.id, role, 'EVC visit rescheduled', 'SCHEDULED', 'SCHEDULED', `${why}. New time ${new Date(t).toLocaleString('en-IN')}`, v.id); notify(); return delay(true)
}
export async function cancelVisit(id, role, reason) {
  init(); need(EVC_PERMS.schedule, role)
  const [v, a] = visitFor(id, role)
  if (v.status !== 'SCHEDULED') throw new Error('Only scheduled visits can be cancelled')
  const why = must(reason, 'Cancellation reason')
  v.status = 'CANCELLED'; v.cancelReason = why; v.updated = Date.now()
  if (a.stage === 'EVC_SCHEDULED') { Object.assign(a, { stage: 'EVC_REQUIRED', daysInStage: 0 }); syncApp(a) }
  log(a.id, role, 'EVC visit cancelled', 'SCHEDULED', 'CANCELLED', why, v.id); notify(); return delay(true)
}
export async function completeVisit(id, role) {
  init(); need(EVC_PERMS.complete, role)
  const [v, a] = visitFor(id, role)
  if (v.status !== 'SCHEDULED') throw new Error('Only scheduled visits can be marked completed')
  if (v.when > Date.now()) throw new Error('The visit date and time have not been reached yet')
  v.status = 'COMPLETED'; v.report = 'PENDING'; v.updated = Date.now()
  log(a.id, role, 'EVC visit completed', 'SCHEDULED', 'COMPLETED', 'Report now due', v.id); notify(); return delay(true)
}
export async function submitEvcReport(id, role, { observations, recommendation }) {
  init(); need(EVC_PERMS.report, role)
  const [v, a] = visitFor(id, role)
  if (v.status !== 'COMPLETED' || v.report !== 'PENDING') throw new Error('A report can only be submitted for a completed visit with a pending report')
  const o = must(observations, 'Observations'), r = must(recommendation, 'Recommendation')
  if (o.length < 10 || r.length < 10) throw new Error('Observations and recommendation need at least 10 characters each')
  v.report = 'SUBMITTED'; v.reportData = { observations: o, recommendation: r, by: ROLES[role], ts: Date.now() }; v.updated = Date.now()
  if (a.stage === 'EVC_SCHEDULED') { Object.assign(a, { stage: 'COMMITTEE_REVIEW', daysInStage: 0 }); syncApp(a) }
  log(a.id, role, 'EVC report submitted', 'PENDING', 'SUBMITTED', o, v.id); notify(); return delay(true)
}
export async function reviewEvcReport(id, role, remarks) {
  init(); need(EVC_PERMS.review, role)
  const [v, a] = visitFor(id, role)
  if (v.report !== 'SUBMITTED') throw new Error('Only a submitted report can be marked reviewed')
  v.report = 'REVIEWED'; v.reviewNote = (remarks || '').trim() || '—'; v.updated = Date.now()
  log(a.id, role, 'EVC report reviewed', 'SUBMITTED', 'REVIEWED', remarks, v.id); notify(); return delay(true)
}
// ---- audit history (reads the shared `events` store) and dashboard metrics ----
const eventSee = (role, e) => {
  const a = appOf(e.app)
  if (!a) return false
  if (role === 'evc') return !!e.target?.startsWith('EVC') || visits.some((v) => v.appId === e.app)
  return role === 'institution' ? a.institution === DEMO_INSTITUTION : visibleTo(role, a)
}
const kindOf = (e) => (e.target?.startsWith('CMP') ? 'Compliance' : e.target?.startsWith('EVC') ? 'EVC visit' : e.action.startsWith('Escalation') ? 'Escalation' : 'Application workflow')
export async function listAuditEvents(role) {
  init()
  return delay(events.filter((e) => eventSee(role, e)).map((e) => ({ ...e, institution: appOf(e.app).institution, kind: kindOf(e) })).sort((x, y) => y.ts - x.ts || y.id - x.id))
}
export async function dashboardMetrics(role) {
  init()
  const vis = apps.filter((a) => visibleTo(role, a)), vs = visits.filter((v) => evcSee(role, appOf(v.appId))), al = alertsFor(role)
  return delay({
    openEscalations: vis.filter((a) => (a.escalationLevel > 0 || esc[a.id]) && (esc[a.id]?.status || 'OPEN') !== 'RESOLVED').length,
    criticalAlerts: al.filter((x) => x.severity === 'CRITICAL').length,
    overdueCompliance: comp.filter((r) => visibleTo(role, appOf(r.appId)) && isOverdue(r)).length,
    upcomingEvc: vs.filter((v) => v.status === 'SCHEDULED' && v.when >= Date.now()).length,
    pendingEvcReports: vs.filter((v) => v.status === 'COMPLETED' && v.report === 'PENDING').length,
  })
}
