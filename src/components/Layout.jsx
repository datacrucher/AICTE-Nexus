import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Bell, CalendarCheck, FileText, Flame, Landmark, LayoutDashboard, ScrollText, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useRole } from '../context/RoleContext'
import { dashboardApi } from '../services/dashboardApi'
import { ROLES, canAccess } from '../config/roles'
const NAV = [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }, { to: '/applications', label: 'Applications', icon: FileText }, { to: '/alerts', label: 'Alerts', icon: Bell, badge: true }, { to: '/escalations', label: 'Escalations', icon: Flame, page: 'escalations' },
  { to: '/compliance', label: 'Compliance', icon: ShieldCheck, page: 'compliance', simulated: true }, { to: '/evc', label: 'EVC', icon: CalendarCheck, page: 'evc', simulated: true }, { to: '/audit-logs', label: 'Audit Logs', icon: ScrollText, page: 'audit', simulated: true }]
export const Tricolour = () => <div className="flex h-1.5" aria-hidden="true"><div className="flex-1 bg-saffron-500" /><div className="flex-1 border-y border-slate-200 bg-white" /><div className="flex-1 bg-indiagreen-500" /></div>
export const Brand = () => (<div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-saffron-500 bg-blue-900 text-white"><Landmark size={22} /></div>
  <div><div className="text-xl font-bold leading-tight text-blue-900">AICTE Nexus</div><div className="text-xs text-slate-600">Approval Workflow Automation, Compliance Monitoring &amp; Alert Management</div></div></div>)
export default function Layout() {
  const { role, realRole, setRole } = useRole(), auth = useAuth(), nav = useNavigate(), [critical, setCritical] = useState(null)
  useEffect(() => {   // live critical-alert count from the API, refreshed after actions
    let live = true; const load = () => dashboardApi.criticalAlerts().then((n) => live && setCritical(n)).catch(() => live && setCritical(null))
    load(); window.addEventListener('nexus:data-changed', load); return () => { live = false; window.removeEventListener('nexus:data-changed', load) }
  }, [realRole])
  const previewing = role !== realRole
  return (<div className="flex min-h-screen flex-col"><Tricolour />
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-100 px-4 py-1 text-xs text-slate-600">
      <span>AICTE Nexus · Administrative Workspace</span>
      <span className="flex flex-wrap items-center gap-3"><span className="font-medium text-slate-700">{auth.profile?.full_name} · {ROLES[realRole]}</span>
        {auth.previewEnabled && <><label>Preview (dev only)</label><select value={role} onChange={(e) => { setRole(e.target.value === realRole ? null : e.target.value); nav('/dashboard') }} className="rounded border bg-white px-1 py-0.5">{Object.entries(ROLES).map(([k, val]) => <option key={k} value={k}>{val}</option>)}</select></>}
        <button onClick={async () => { await auth.signOut(); nav('/login') }} className="font-semibold text-blue-800 hover:underline">Sign out</button></span></div>
    <header className="border-b border-slate-200 bg-white px-4 py-3"><div className="mx-auto max-w-7xl"><Brand /></div></header>
    <nav className="bg-blue-900 text-white shadow"><div className="mx-auto flex max-w-7xl overflow-x-auto">
      {NAV.filter((n) => canAccess(role, n.page)).map(({ to, label, icon: I, badge, simulated }) => <NavLink key={to} to={to} className={({ isActive }) => `flex items-center gap-1.5 whitespace-nowrap border-b-4 px-4 py-3 text-sm font-medium ${isActive ? 'border-saffron-500 bg-blue-800' : 'border-transparent hover:bg-blue-800'}`}><I size={16} />{label}
        {badge && critical > 0 && <span title="Critical alerts (live, from the API)" className="rounded-full bg-red-600 px-1.5 text-xs text-white">{critical}</span>}
        {simulated && <span title="Simulated in-memory demo data" className="rounded bg-saffron-500 px-1 text-[10px] font-semibold uppercase text-white">demo</span>}</NavLink>)}</div></nav>
    <div className="border-b border-saffron-400 bg-saffron-50 px-4 py-1.5 text-xs text-slate-700"><div className="mx-auto max-w-7xl">{previewing ? `DEV preview: demo-data pages act as ${ROLES[role]}. Dashboard and Applications always use your real account (${ROLES[realRole]}); preview cannot grant database access.` : 'Live from the backend database: Dashboard, Applications, Alerts, Escalations and the alert badge. Simulated in-memory demo data (resets on refresh, tagged "demo"): Compliance, EVC, Audit Logs.'}</div></div>
    <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6"><Outlet /></main>
    <footer className="bg-blue-950 px-4 py-4 text-xs text-blue-200"><div className="mx-auto max-w-7xl">AICTE Nexus · Approval Workflow Automation · Compliance Monitoring · Alert Management</div></footer></div>)
}
