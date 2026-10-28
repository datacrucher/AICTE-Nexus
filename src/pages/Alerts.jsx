import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { alertsApi } from '../services/alertsApi'
import Badge from '../components/Badge'
const TYPES = ['OVERDUE', 'DEADLINE', 'DOCUMENT', 'ACTION', 'COMPLIANCE', 'EVC']
export default function Alerts() {
  const [data, setData] = useState(null), [err, setErr] = useState(null), [sev, setSev] = useState(''), [type, setType] = useState(''), [tick, setTick] = useState(0)
  useEffect(() => { const b = () => setTick((t) => t + 1); window.addEventListener('nexus:data-changed', b); return () => window.removeEventListener('nexus:data-changed', b) }, [])
  useEffect(() => { let live = true; alertsApi.load().then((r) => { if (live) { setData(r); setErr(null) } }).catch((e) => live && setErr(e.message)); return () => { live = false } }, [tick])
  if (!data && err) return <div className="text-sm text-red-700">Could not load alerts: {err} <button onClick={() => setTick((t) => t + 1)} className="ml-2 text-blue-800 underline">Retry</button></div>
  if (!data) return <p className="text-sm text-slate-500">Loading alerts...</p>
  const list = data.alerts, rows = list.filter((a) => (!sev || a.severity === sev) && (!type || a.type === type))
  return (<div className="space-y-3"><h1 className="text-lg font-semibold text-blue-900">Alerts</h1>
    <p className="text-xs text-slate-500">Evaluated live by the backend from the records your account may see using demo rules shown on each card. There is no alerts table, so alerts are not stored, acknowledged or emailed, and they are not official AICTE notices.</p>
    {data.truncated && <p className="text-xs text-amber-700">Showing alerts for the first 1,000 visible applications only.</p>}
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      {['', 'CRITICAL', 'WARNING', 'INFO'].map((s) => <button key={s} onClick={() => setSev(s)} className={`rounded border px-2.5 py-1 ${sev === s ? 'border-blue-800 bg-blue-50 text-blue-900' : ''}`}>{s || 'All'}{s ? ` (${list.filter((a) => a.severity === s).length})` : ` (${list.length})`}</button>)}
      <select value={type} onChange={(e) => setType(e.target.value)} className="rounded border bg-white px-2 py-1"><option value="">All types</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
    {rows.length === 0 ? <p className="rounded-lg border bg-white p-6 text-center text-sm text-slate-500">No alerts for your account with these filters.</p> :
      rows.slice(0, 100).map((a) => <div key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"><div><div className="text-sm font-medium">{a.title} <Link to={`/applications/${a.appId}`} className="font-normal text-blue-800 hover:underline">· {a.appId}</Link></div>
        <div className="text-xs text-slate-500">{a.institution} · Responsible: {a.officer} · Due: {a.due}</div><div className="mt-1 text-xs text-slate-600">{a.why}</div></div><Badge value={a.severity === 'CRITICAL' ? 'OVERDUE' : a.severity === 'WARNING' ? 'AT_RISK' : 'INFO'} label={a.severity} /></div>)}
    {rows.length > 100 && <p className="text-xs text-slate-500">Showing the first 100 of {rows.length} alerts; narrow the filters to see others.</p>}</div>)
}
