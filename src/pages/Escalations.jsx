import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { escalationsApi } from '../services/escalationsApi'
import { useAuth } from '../context/AuthContext'
import { canAccess, ESC_ACTIONS, ROLES } from '../config/roles'
import { ESCALATION_LABELS } from '../config/workflow'
import { fmtDate } from '../lib/dates'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
const ts = (t) => new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
export default function Escalations() {
  const { role } = useAuth()   // database-derived role; the database re-checks every action
  const [data, setData] = useState(null), [err, setErr] = useState(null), [st, setSt] = useState(''), [dlg, setDlg] = useState(null), [remarks, setRemarks] = useState(''), [msg, setMsg] = useState(null), [derr, setDerr] = useState(null), [busy, setBusy] = useState(false), [tick, setTick] = useState(0)
  const allowed = canAccess(role, 'escalations')
  useEffect(() => { if (!allowed) return undefined; let live = true; escalationsApi.list().then((r) => { if (live) { setData(r); setErr(null) } }).catch((e) => live && setErr(e.message)); return () => { live = false } }, [allowed, tick])
  if (!allowed) return <p className="rounded-lg border bg-white p-6 text-sm text-slate-600">The {ROLES[role]} role does not have access to escalations.</p>
  if (!data && err) return <div className="text-sm text-red-700">Could not load escalations: {err} <button onClick={() => setTick((t) => t + 1)} className="ml-2 text-blue-800 underline">Retry</button></div>
  if (!data) return <p className="text-sm text-slate-500">Loading escalations...</p>
  const can = (k) => ESC_ACTIONS[k].roles.includes(role), shown = data.rows.filter((r) => !st || r.status === st)
  const run = async () => { setBusy(true); setDerr(null); try { await escalationsApi.act(dlg.id, dlg.kind, remarks); setMsg(`Escalation ${dlg.kind}d for ${dlg.ref}. The database recorded the change and an audit event.`); setDlg(null); setRemarks(''); setTick((t) => t + 1) } catch (e) { setDerr(e.message) } setBusy(false) }
  return (<div className="space-y-3"><h1 className="text-lg font-semibold text-blue-900">Escalations</h1>
    <p className="text-xs text-slate-500">Live from the backend database. Acknowledge: Super Admin and Regional Officer. Resolve: Super Admin (remarks required). Your role: {ROLES[role]}{!can('acknowledge') && ' (view only)'}. Escalation records come from the database; automatic creation and re-levelling by a scheduled job is not implemented yet.</p>
    {msg && <p className="text-sm text-emerald-700">{msg}</p>}
    <select value={st} onChange={(e) => setSt(e.target.value)} className="rounded border bg-white px-2 py-1.5 text-sm"><option value="">All statuses</option>{['OPEN', 'ACKNOWLEDGED', 'RESOLVED'].map((s) => <option key={s}>{s}</option>)}</select>
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4">{shown.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No escalations for your account with this filter.</p> :
      <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500">{['Case', 'Reason', 'Officer', 'Stage deadline (demo)', 'Level', 'Notified', 'Status', 'Actions'].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{shown.map((r) => <tr key={r.id} className="border-b border-slate-100"><td className="py-2 pr-3"><Link to={`/applications/${r.app.id}`} className="font-semibold text-blue-900 hover:underline">{r.app.id}</Link><div className="text-xs text-slate-400">{r.app.institution}</div></td><td className="pr-3">{r.reason}</td><td className="pr-3">{r.app.officer}</td><td className="pr-3">{r.app.remaining == null ? 'n/a' : fmtDate(r.app.remaining)}</td>
          <td className="pr-3"><Badge value={r.level >= 3 ? 'CRITICAL' : 'HIGH'} label={`Level ${r.level}`} /></td><td className="pr-3">{ESCALATION_LABELS[r.level]}</td><td className="pr-3"><Badge value={r.status === 'RESOLVED' ? 'ON_TRACK' : r.status === 'ACKNOWLEDGED' ? 'AT_RISK' : 'OVERDUE'} label={r.status} /></td>
          <td className="space-x-1 whitespace-nowrap">{r.status === 'OPEN' && can('acknowledge') && <button onClick={() => { setMsg(null); setDerr(null); setDlg({ id: r.id, ref: r.app.id, kind: 'acknowledge' }) }} className="rounded border px-2 py-1 text-xs">Acknowledge</button>}{r.status !== 'RESOLVED' && can('resolve') && <button onClick={() => { setMsg(null); setDerr(null); setDlg({ id: r.id, ref: r.app.id, kind: 'resolve' }) }} className="rounded bg-blue-900 px-2 py-1 text-xs text-white">Resolve</button>}</td></tr>)}</tbody></table>}</div>
    <div className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="mb-2 text-sm font-semibold text-slate-700">Escalation action history (audit trail)</h3>{data.history.length === 0 ? <p className="text-sm text-slate-500">No escalation actions recorded yet.</p> : data.history.map((h) => <div key={h.id} className="border-b border-slate-100 py-1.5 text-sm">{ts(h.ts)} · {h.actor_role} · {h.from_value} → {h.to_value} on <Link to={`/applications/${h.reference}`} className="text-blue-800">{h.reference}</Link>{h.remarks ? ` · ${h.remarks}` : ''}</div>)}</div>
    {dlg && <Modal title={`${ESC_ACTIONS[dlg.kind].label} escalation`} onCancel={() => setDlg(null)} onConfirm={run} busy={busy}><p className="mb-2 text-sm text-slate-600">{dlg.ref}. {dlg.kind === 'resolve' ? 'Remarks are required.' : 'Remarks are optional.'}</p><textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className="w-full rounded border p-2 text-sm" placeholder="Remarks" />{derr && <p className="mt-2 text-sm text-red-700">{derr}</p>}</Modal>}</div>)
}
