// Applications module on the FastAPI backend. Authorization, SLA, risk and workflow rules are enforced server-side; this file only calls the API.
import { http } from '../lib/apiClient'
export const PAGE_SIZE = 10
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
export const notifyChanged = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('nexus:data-changed')) }
export function toApp(r) {
  return { dbId: r.id, id: r.reference, institution: r.institution_name || 'Unknown institution', region: r.region_name || r.region_code, type: r.application_type, stage: r.stage,
    daysInStage: r.days_in_stage, sla: r.sla_days ?? 0, remaining: r.remaining_days, slaStatus: r.sla_status, officer: r.officer_name || (r.assigned_officer ? 'Assigned officer' : 'Unassigned'),
    leaseDays: r.lease_days ?? 9999, openObservations: r.open_observations, risk: r.risk_level, riskScore: r.risk_score, riskReasons: r.risk_reasons || [],
    escalationLevel: r.escalation_level, priority: r.priority, daysPending: r.days_pending, submittedOn: fmtDate(r.submitted_at) }
}
export function createApplicationsApi(h) {
  return {
    async list({ page = 0, q = '', stage = '', region = '', sla = '', risk = '', institution = '' } = {}) {
      const r = await h.get('/applications', { page, q, stage, region, sla, risk, institution }); return { rows: r.rows.map(toApp), total: r.total }
    },
    lookups() { return h.get('/applications/lookups') },
    async create(payload) { const r = await h.post('/applications', payload); notifyChanged(); return toApp(r) },
    async get(reference) { try { return toApp(await h.get(`/applications/${encodeURIComponent(reference)}`)) } catch (e) { if (e.status === 404) return null; throw e } },
    detail(app) { return h.get(`/applications/${encodeURIComponent(app.id)}/detail`) },
    actions() { return h.get('/workflow/actions') },
    async transition(appId, actionId, remarks) { await h.post(`/applications/${encodeURIComponent(appId)}/transition`, { action: actionId, remarks: remarks || null }); notifyChanged() },
    async uploadDocument(appId, file, docType) {
      const form = new FormData(); form.append('file', file); form.append('doc_type', docType)
      const r = await h.upload(`/applications/${encodeURIComponent(appId)}/documents`, form); notifyChanged(); return r
    },
    async verifyDocument(appId, documentId, status) {
      const r = await h.post(`/applications/${encodeURIComponent(appId)}/documents/${encodeURIComponent(documentId)}/verify`, { status }); notifyChanged(); return r
    },
    async createDownloadTicket(appId, documentId) {
      return h.post(`/applications/${encodeURIComponent(appId)}/documents/${encodeURIComponent(documentId)}/download-ticket`, {})
    },
    downloadDocumentUrl(appId, documentId) {
      return h.url(`/applications/${encodeURIComponent(appId)}/documents/${encodeURIComponent(documentId)}/download`)
    },
  }
}
export const applicationsApi = createApplicationsApi(http)
