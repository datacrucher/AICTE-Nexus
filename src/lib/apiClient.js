// Single HTTP client for the FastAPI backend. The base URL is not a secret: '/api' (dev proxy / same origin) or e.g. https://api.example.org/api.
const BASE = String(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const KEY = 'nexus-token'   // sessionStorage: cleared when the tab closes. The token only identifies the user; the role always comes from the server.
export const getToken = () => { try { return sessionStorage.getItem(KEY) } catch { return null } }
export const setToken = (t) => { try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY) } catch { /* storage unavailable */ } }
export class ApiError extends Error { constructor(message, status) { super(message); this.status = status } }
export function createHttp(fetchImpl = (...a) => fetch(...a)) {
  async function request(method, path, { params, body, auth = true } = {}) {
    const url = new URL(BASE + path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    Object.entries(params || {}).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) url.searchParams.set(k, v) })
    const headers = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const token = auth ? getToken() : null
    if (token) headers.Authorization = `Bearer ${token}`
    let res
    try { res = await fetchImpl(url.toString(), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }) }
    catch { throw new ApiError('Cannot reach the server. Check your connection and that the backend is running.', 0) }
    let data = null
    try { data = res.status === 204 ? null : await res.json() } catch { /* non-JSON body */ }
    if (!res.ok) {
      if (res.status === 401 && auth && typeof window !== 'undefined') window.dispatchEvent(new Event('nexus:unauthorized'))
      throw new ApiError((data && typeof data.detail === 'string' && data.detail) || `Request failed (${res.status})`, res.status)
    }
    return data
  }
  async function upload(path, formData) {
    const url = new URL(BASE + path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    const headers = { Accept: 'application/json' }
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    let res
    try { res = await fetchImpl(url.toString(), { method: 'POST', headers, body: formData }) }
    catch { throw new ApiError('Cannot reach the server. Check that the backend is running.', 0) }
    let data = null
    try { data = await res.json() } catch {}
    if (!res.ok) {
      if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('nexus:unauthorized'))
      throw new ApiError((data && typeof data.detail === 'string' && data.detail) || `Request failed (${res.status})`, res.status)
    }
    return data
  }
  async function download(path) {
    const url = new URL(BASE + path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    const headers = {}; const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    let res
    try { res = await fetchImpl(url.toString(), { headers }) }
    catch { throw new ApiError('Cannot reach the server. Check that the backend is running.', 0) }
    if (!res.ok) { let data = {}; try { data = await res.json() } catch {}; throw new ApiError(data.detail || `Download failed (${res.status})`, res.status) }
    return res.blob()
  }
  return { get: (path, params) => request('GET', path, { params }), post: (path, body, opts) => request('POST', path, { body: body ?? {}, ...opts }), upload, download,
    url: (path) => new URL(BASE + path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').toString() }
}
export const http = createHttp()
