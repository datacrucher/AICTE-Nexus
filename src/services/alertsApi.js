// Alerts are evaluated by the backend from live, role-scoped records with DEMO rules. There is no alerts table: they are not stored or acknowledged.
import { http } from '../lib/apiClient'
export function createAlertsApi(h) { return { load() { return h.get('/alerts') } } }
export const alertsApi = createAlertsApi(http)
