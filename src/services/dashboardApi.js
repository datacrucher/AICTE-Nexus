import { http } from '../lib/apiClient'
import { toApp } from './applicationsApi'
export function createDashboardApi(h) {
  return {
    async load() { const d = await h.get('/dashboard'); return { ...d, queue: d.queue.map(toApp) } },
    async criticalAlerts() { return (await h.get('/dashboard/critical-alerts')).critical_alerts },
  }
}
export const dashboardApi = createDashboardApi(http)
