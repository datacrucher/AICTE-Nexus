import { http } from '../lib/apiClient'
import { notifyChanged, toApp } from './applicationsApi'
export function createEscalationsApi(h) {
  return {
    async list() { const r = await h.get('/escalations'); return { rows: r.rows.map((x) => ({ ...x, app: toApp(x.app) })), history: r.history } },
    async act(id, kind, remarks) { await h.post(`/escalations/${encodeURIComponent(id)}/act`, { kind, remarks: remarks || null }); notifyChanged() },
  }
}
export const escalationsApi = createEscalationsApi(http)
