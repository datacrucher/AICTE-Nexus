import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAuditEvents } from '../services/applications'
import { useRole } from '../context/RoleContext'
import { useDataVersion } from '../hooks/useDataVersion'
import { ROLES } from '../config/roles'
import Badge from '../components/Badge'
const PAGE = 15, F0 = { q: '', action: '', role: '', kind: '', source: '', from: '', to: '' }
const ts = (t) => new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const Sel = ({ v, set, all, opts }) => <select value={v} onChange={(e) => set(e.target.value)} className="rounded border bg-white px-2 py-1.5 text-sm"><option value="">{all}</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>
export default function AuditLogs() {
  const { role } = useRole(), ver = useDataVersion(), [ev, setEv] = useState(null), [err, setErr] = useState(null), [f, setF] = useState(F0), [pg, setPg] = useState(0)
  useEffect(() => { listAuditEvents(role).then(setEv).catch(setErr) }, [role, ver])
  const up = (k) => (v) => { setF((p) => ({ ...p, [k]: v })); setPg(0) }
  const uniq = (k) => [...new Set((ev || []).map((e) => e[k]))].sort()
  const rows = useMemo(() => (ev || []).filter((e) => {
    const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : 0, to = f.to ? new Date(`${f.to}T23:59:59`).getTime() : Infinity
    return (!f.q || `${e.actor} ${e.action} ${e.app} ${e.target || ''} ${e.remarks} ${e.institution}`.toLowerCase().includes(f.q.toLowerCase())) && (!f.action || e.action === f.action) && (!f.role || e.role === f.role) && (!f.kind || e.kind === f.kind)
      && (!f.source || (f.source === 'Seeded' ? e.simulated : !e.simulated)) && e.ts >= from && e.ts <= to }), [ev, f])
  if (err) return <p className="text-sm text-red-700">Could not load audit logs. Please refresh.</p>
  if (!ev) return <p className="text-sm text-slate-500">Loading audit logs...</p>
  const page = rows.slice(pg * PAGE, pg * PAGE + PAGE)
  return (<div className="space-y-3"><h1 className="text-lg font-semibold text-blue-900">Audit Logs</h1>
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Simulated audit history for demonstration. Events are held in browser memory, are cleared on refresh, and are not tamper-proof or a legal record. Seeded events are fictional. Showing events visible to: {ROLES[role]}.</div>
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <input value={f.q} onChange={(e) => up('q')(e.target.value)} placeholder="Search actor, action, record, remarks" className="w-64 rounded border px-2 py-1.5 text-sm" />
      <Sel v={f.action} set={up('action')} all="All actions" opts={uniq('action')} /><Sel v={f.role} set={up('role')} all="All roles" opts={uniq('role')} /><Sel v={f.kind} set={up('kind')} all="All targets" opts={uniq('kind')} /><Sel v={f.source} set={up('source')} all="All sources" opts={['Seeded', 'This session']} />
      <label className="text-xs text-slate-500">From <input type="date" value={f.from} onChange={(e) => up('from')(e.target.value)} className="rounded border px-1 py-1 text-sm" /></label>
      <label className="text-xs text-slate-500">To <input type="date" value={f.to} onChange={(e) => up('to')(e.target.value)} className="rounded border px-1 py-1 text-sm" /></label>
      <button onClick={() => { setF(F0); setPg(0) }} className="text-sm text-blue-800">Clear</button></div>
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4">{rows.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No events match for this role and filter.</p> :
      <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500">{['Timestamp', 'Actor', 'Role', 'Action', 'Target', 'Application', 'Change', 'Remarks', 'Source'].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{page.map((e) => <tr key={e.id} className="border-b border-slate-100 align-top"><td className="py-2 pr-3 whitespace-nowrap">{ts(e.ts)}</td><td className="pr-3">{e.actor}</td><td className="pr-3">{e.role}</td><td className="pr-3">{e.action}</td><td className="pr-3">{e.target || e.kind}</td>
          <td className="pr-3"><Link to={`/applications/${e.app}`} className="font-semibold text-blue-900 hover:underline">{e.app}</Link></td><td className="pr-3 whitespace-nowrap">{e.from} → {e.to}</td><td className="pr-3">{e.remarks}</td><td><Badge value={e.simulated ? 'DONE' : 'INFO'} label={e.simulated ? 'Seeded' : 'This session'} /></td></tr>)}</tbody></table>}
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{rows.length} event(s), newest first</span><span className="space-x-2"><button disabled={pg === 0} onClick={() => setPg(pg - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Prev</button><span>Page {pg + 1} of {Math.max(1, Math.ceil(rows.length / PAGE))}</span><button disabled={(pg + 1) * PAGE >= rows.length} onClick={() => setPg(pg + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next</button></span></div></div></div>)
}
