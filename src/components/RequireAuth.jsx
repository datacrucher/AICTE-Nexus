import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
const Shell = ({ children }) => <div className="flex min-h-screen items-center justify-center p-4"><div className="w-full max-w-lg rounded-lg border bg-white p-8 text-sm">{children}</div></div>
export function NoAccess({ reason, onSignOut }) {
  return (<Shell><h1 className="mb-2 text-lg font-semibold text-blue-900">No access</h1>
    <p className="mb-4 text-slate-600">{reason === 'INACTIVE' ? 'Your account is deactivated.' : 'Your account has no valid role in this system. Ask an administrator.'}</p>
    <button onClick={onSignOut} className="rounded border px-3 py-1.5">Sign out</button></Shell>)
}
export default function RequireAuth() {
  const a = useAuth(), loc = useLocation()
  if (a.loading) return <Shell><p className="text-slate-500">Loading session...</p></Shell>
  if (a.error && !a.session) return <Shell><h1 className="mb-2 text-lg font-semibold text-blue-900">Cannot reach the server</h1><p className="mb-4 text-slate-600">{a.error}</p><button onClick={a.retry} className="rounded border px-3 py-1.5">Retry</button></Shell>
  if (!a.session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (!a.access.ok) return <NoAccess reason={a.access.reason} onSignOut={a.signOut} />
  return <Outlet />
}
