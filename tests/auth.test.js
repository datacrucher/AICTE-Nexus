import test from 'node:test'
import assert from 'node:assert/strict'
import { accessFromProfile } from '../src/lib/profile.js'
import { ApiError, createHttp, getToken, setToken } from '../src/lib/apiClient.js'
const store = new Map(); globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body })
test('the role is whatever the API says; missing, inactive and unknown roles are denied', () => {
  assert.deepEqual(accessFromProfile({ role: 'institution', is_active: true, user_metadata: { role: 'admin' } }), { ok: true, role: 'institution' })
  assert.equal(accessFromProfile(null).reason, 'NO_PROFILE'); assert.equal(accessFromProfile({ role: 'admin', is_active: false }).reason, 'INACTIVE'); assert.equal(accessFromProfile({ role: 'root', is_active: true }).reason, 'UNKNOWN_ROLE')
  for (const r of ['admin', 'regional', 'scrutiny', 'institution', 'evc']) assert.equal(accessFromProfile({ role: r, is_active: true }).role, r)
})
test('the bearer token is sent only when present and only for authenticated calls', async () => {
  const seen = []; const h = createHttp(async (url, o) => { seen.push({ url, headers: o.headers }); return reply(200, { ok: true }) })
  setToken(null); await h.get('/applications'); assert.equal(seen[0].headers.Authorization, undefined)
  setToken('tok123'); await h.get('/applications'); await h.post('/auth/login', { a: 1 }, { auth: false })
  assert.equal(seen[1].headers.Authorization, 'Bearer tok123'); assert.equal(seen[2].headers.Authorization, undefined); setToken(null); assert.equal(getToken(), null)
})
test('query parameters skip empty values and are URL-encoded', async () => {
  let url; const h = createHttp(async (u) => { url = u; return reply(200, {}) }); await h.get('/applications', { page: 0, q: 'a&b=c', stage: '', region: undefined })
  assert.ok(url.includes('page=0') && url.includes('q=a%26b%3Dc') && !url.includes('stage') && !url.includes('region'))
})
test('API errors surface the server message; network failures are explained; no silent fallback data', async () => {
  await assert.rejects(createHttp(async () => reply(403, { detail: 'Your role is not permitted to do this', code: 403 })).get('/escalations'), (e) => e instanceof ApiError && e.status === 403 && /not permitted/.test(e.message))
  await assert.rejects(createHttp(async () => { throw new TypeError('fetch failed') }).get('/x'), (e) => e.status === 0 && /Cannot reach the server/.test(e.message))
  await assert.rejects(createHttp(async () => reply(500, null)).get('/x'), /Request failed \(500\)/)
})
