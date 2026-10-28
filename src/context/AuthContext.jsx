import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getToken, http, setToken } from '../lib/apiClient'
import { accessFromProfile } from '../lib/profile'
const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)
// Development-only UI preview (Vite sets import.meta.env.DEV to false in production builds). It only changes which role the in-memory demo pages
// (Compliance, EVC, Audit Logs) pretend to be. It never changes the signed-in session, so it cannot grant any API access.
export const PREVIEW_ENABLED = import.meta.env.DEV === true
export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null), [loading, setLoading] = useState(Boolean(getToken())), [error, setError] = useState(null), [preview, setPreview] = useState(null), [tick, setTick] = useState(0)
  useEffect(() => {
    if (!getToken()) { setProfile(null); setLoading(false); return undefined }
    let live = true; setLoading(true)
    http.get('/auth/me').then((u) => { if (live) { setProfile(u); setError(null) } })
      .catch((e) => { if (!live) return; if (e.status === 401) { setToken(null); setProfile(null) } else setError(e.message) })
      .finally(() => live && setLoading(false))
    return () => { live = false }
  }, [tick])
  useEffect(() => { const h = () => { setToken(null); setProfile(null) }; window.addEventListener('nexus:unauthorized', h); return () => window.removeEventListener('nexus:unauthorized', h) }, [])
  const access = accessFromProfile(profile)
  const value = useMemo(() => ({
    loading, error, retry: () => setTick((t) => t + 1), profile, access, session: profile ? { user: { id: profile.id } } : null, role: access.ok ? access.role : null,
    previewEnabled: PREVIEW_ENABLED, previewRole: PREVIEW_ENABLED ? preview : null, setPreviewRole: PREVIEW_ENABLED ? setPreview : () => {},
    signIn: async (email, password) => {
      try { const r = await http.post('/auth/login', { email, password }, { auth: false }); setToken(r.access_token); setProfile(r.user); setError(null); return { error: null } }
      catch (e) { return { error: e.status === 401 ? 'Invalid email or password.' : e.message } }
    },
    signInDemo: async (role) => {
      try { const r = await http.post('/auth/demo-login', { role }, { auth: false }); setToken(r.access_token); setProfile(r.user); setError(null); return { error: null } }
      catch (e) { return { error: e.message || 'Demo access is unavailable.' } }
    },
    signOut: async () => { try { await http.post('/auth/logout') } catch { /* token is discarded either way */ } setToken(null); setProfile(null); setPreview(null) },
  }), [loading, error, profile, access.ok, access.role, preview])  // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
