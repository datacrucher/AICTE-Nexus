import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Bell, CalendarClock, CheckCircle2, ClipboardList, FileStack, Flame, Gauge, Hourglass, ShieldAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { dashboardApi } from '../services/dashboardApi'
import { canAccess } from '../config/roles'
import { STAGES } from '../config/workflow'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
const Chart = ({ title, data, color }) => (<div className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
  <ResponsiveContainer width="100%" height={240}><BarChart data={data} layout="vertical" margin={{ left: 40 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" fill={color} radius={3} /></BarChart></ResponsiveContainer></div>)
export default function Dashboard() {
  const { role } = useAuth()   // database-derived role; it only decides which cards are shown, the data itself is filtered by RLS
  const [d, setD] = useState(null), [err, setErr] = useState(null), [loading, setLoading] = useState(true), [tick, setTick] = useState(0)
  useEffect(() => {   // refresh after workflow actions and when the tab becomes visible again
    const bump = () => setTick((t) => t + 1), vis = () => document.visibilityState === 'visible' && bump()
    window.addEventListener('nexus:data-changed', bump); document.addEventListener('visibilitychange', vis)
    return () => { window.removeEventListener('nexus:data-changed', bump); document.removeEventListener('visibilitychange', vis) }
  }, [])
  useEffect(() => {
    let live = true; setLoading(true)
    dashboardApi.load().then((r) => { if (live) { setD(r); setErr(null) } }).catch((e) => live && setErr(e.message)).finally(() => live && setLoading(false))
    return () => { live = false }
  }, [tick])
  if (!d && err) return <div className="text-sm text-red-700">Could not load the dashboard: {err} <button onClick={() => setTick((t) => t + 1)} className="ml-2 text-blue-800 underline">Retry</button></div>
  if (!d) return <p className="text-sm text-slate-500">Loading dashboard...</p>
  const m = d.metrics
  if (m.total_applications === 0) return <div className="rounded-lg border bg-white p-6 text-sm text-slate-600"><h1 className="mb-1 text-lg font-semibold text-blue-900">Command Center</h1>No applications are visible to your account yet.</div>
  return (<div className={`space-y-4 ${loading ? 'opacity-70' : ''}`}><h1 className="text-lg font-semibold text-blue-900">Command Center</h1>
    <p className="text-xs text-slate-500">Live data from the backend database, limited to what your account is allowed to see (fictional demo seed). Cards and charts use the same authorized scope.</p>
    {err && <p className="text-xs text-red-700">Refresh failed ({err}); showing the last loaded numbers.</p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard icon={FileStack} label="Total applications" value={m.total_applications} hint="Visible to your account" />
      <StatCard icon={Hourglass} label="Pending" value={m.pending_applications} hint="In processing" />
      <StatCard icon={CheckCircle2} label="Approved" value={m.approved_applications} hint="Monitoring compliance" tone="text-emerald-700" />
      <StatCard icon={AlertTriangle} label="Overdue" value={m.overdue_applications} hint="Past stage SLA" tone="text-red-700" />
      <StatCard icon={Gauge} label="SLA compliance" value={m.pending_applications ? `${Math.round(((m.pending_applications - m.overdue_applications) / m.pending_applications) * 100)}%` : 'n/a'} hint="Pending within SLA" /></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {canAccess(role, 'escalations') && <StatCard icon={Flame} label="Open escalations" value={m.open_escalations} hint="Not yet resolved" tone="text-red-700" />}
      <StatCard icon={Bell} label="Critical alerts" value={m.critical_alerts} hint="Across visible records" tone="text-red-700" />
      {canAccess(role, 'compliance') && <StatCard icon={ShieldAlert} label="Overdue compliance" value={m.overdue_compliance} hint="Past due, no accepted evidence" tone="text-red-700" />}
      {canAccess(role, 'evc') && <StatCard icon={CalendarClock} label="Upcoming EVC visits" value={m.upcoming_evc_visits} hint="Scheduled, date not reached" />}
      {canAccess(role, 'evc') && <StatCard icon={ClipboardList} label="Pending EVC reports" value={m.pending_evc_reports} hint="Visit done, report due" tone="text-amber-700" />}</div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Chart title="Applications by stage" color="#1e3a8a" data={STAGES.map((s) => ({ name: s.replace(/_/g, ' '), value: d.stages[s] || 0 }))} />
      <Chart title="Region-wise overdue" color="#dc2626" data={d.regions.map((r) => ({ name: r.name, value: r.overdue }))} /></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div><Chart title="Applications by risk level" color="#b45309" data={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((k) => ({ name: k, value: d.risk[k] || 0 }))} />{d.riskTruncated && <p className="mt-1 text-xs text-amber-700">Risk distribution covers the first 1,000 visible applications only.</p>}</div>
      <div className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="mb-3 text-sm font-semibold text-slate-700">Recent activity (from the audit trail)</h3>
        {d.recent.length === 0 ? <p className="text-sm text-slate-500">No recorded activity yet.</p> : <ul className="space-y-1.5 text-sm">{d.recent.map((r) => <li key={r.id} className="flex flex-wrap gap-x-2"><span className="text-xs text-slate-400">{new Date(r.ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><span>{r.action}</span>{r.reference && <Link to={`/applications/${r.reference}`} className="text-blue-800 hover:underline">{r.reference}</Link>}<span className="text-xs text-slate-500">{r.from && r.to ? `${r.from} → ${r.to}` : r.to}</span><span className="text-xs text-slate-400">{r.actor}{r.simulated ? ' · seeded' : ''}</span></li>)}</ul>}</div></div>
    <div className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="mb-3 text-sm font-semibold text-slate-700">Action required (highest risk first)</h3>
      {d.queue.length === 0 ? <p className="text-sm text-slate-500">Nothing needs attention.</p> :
      <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500">{['Application', 'Institution', 'Stage', 'Responsible', 'SLA', 'Risk'].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{d.queue.map((a) => <tr key={a.dbId} className="border-b border-slate-100"><td className="py-2 pr-3"><Link to={`/applications/${a.id}`} className="font-semibold text-blue-900 hover:underline">{a.id}</Link></td><td className="pr-3">{a.institution}</td><td className="pr-3">{a.stage.replace(/_/g, ' ')}</td><td className="pr-3">{a.officer}</td>
          <td className="pr-3"><Badge value={a.slaStatus} label={a.remaining < 0 ? `${-a.remaining}d overdue` : `${a.remaining}d left`} /></td><td><Badge value={a.risk} /></td></tr>)}</tbody></table>}</div></div>)
}
