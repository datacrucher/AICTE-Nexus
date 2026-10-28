import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { COMMITTEE, cancelVisit, completeVisit, listEvc, rescheduleVisit, reviewEvcReport, scheduleVisit, submitEvcReport } from '../services/applications'
import { useRole } from '../context/RoleContext'
import { useDataVersion } from '../hooks/useDataVersion'
import { EVC_PERMS, ROLES, canAccess } from '../config/roles'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
const fmt = (t) => new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const minNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16)
const TITLE = { schedule: 'Schedule visit', reschedule: 'Reschedule visit', cancel: 'Cancel visit', complete: 'Mark visit completed', report: 'Submit EVC report', review: 'Mark report reviewed' }
const RL = { NOT_DUE: 'Not due', PENDING: 'Pending', SUBMITTED: 'Submitted', REVIEWED: 'Reviewed' }
const F0 = { when: '', members: [], reason: '', obs: '', rec: '', remarks: '' }
const ta = 'w-full rounded border p-2 text-sm mt-2'
export default function Evc() {
  const { role } = useRole(), ver = useDataVersion(), [data, setData] = useState(null), [err, setErr] = useState(null), [view, setView] = useState('schedule'), [st, setSt] = useState(''), [q, setQ] = useState('')
  const [dlg, setDlg] = useState(null), [f, setF] = useState(F0), [msg, setMsg] = useState(null), [derr, setDerr] = useState(null), [busy, setBusy] = useState(false)
  useEffect(() => { if (canAccess(role, 'evc')) listEvc(role).then(setData).catch(setErr) }, [role, ver])
  if (!canAccess(role, 'evc')) return <p className="rounded-lg border bg-white p-6 text-sm text-slate-600">The {ROLES[role]} demo role does not have access to EVC management.</p>
  if (err) return <p className="text-sm text-red-700">Could not load EVC data. Please refresh.</p>
  if (!data) return <p className="text-sm text-slate-500">Loading EVC data...</p>
  const can = (k) => EVC_PERMS[k].includes(role), set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const open = (kind, t) => { setF(kind === 'reschedule' ? { ...F0, members: t.members } : F0); setDerr(null); setMsg(null); setDlg({ kind, t }) }
  const run = async () => { setBusy(true); setDerr(null); const { kind, t } = dlg
    try { if (kind === 'schedule') await scheduleVisit(t.id, role, { when: f.when, members: f.members }); else if (kind === 'reschedule') await rescheduleVisit(t.id, role, { when: f.when, members: f.members, reason: f.reason })
      else if (kind === 'cancel') await cancelVisit(t.id, role, f.reason); else if (kind === 'complete') await completeVisit(t.id, role); else if (kind === 'report') await submitEvcReport(t.id, role, { observations: f.obs, recommendation: f.rec }); else await reviewEvcReport(t.id, role, f.remarks)
      setMsg(`${TITLE[kind]}: recorded (simulated, in memory only).`); setDlg(null) } catch (e) { setDerr(e.message) } setBusy(false) }
  const Acts = ({ v }) => (<span className="space-x-1 whitespace-nowrap">
    {v.status === 'SCHEDULED' && can('schedule') && <><button onClick={() => open('reschedule', v)} className="rounded border px-2 py-1 text-xs">Reschedule</button><button onClick={() => open('cancel', v)} className="rounded border px-2 py-1 text-xs text-red-700">Cancel</button></>}
    {v.status === 'SCHEDULED' && can('complete') && <button disabled={v.when > Date.now()} title={v.when > Date.now() ? 'Visit date not reached yet' : ''} onClick={() => open('complete', v)} className="rounded bg-blue-900 px-2 py-1 text-xs text-white disabled:opacity-40">Mark completed</button>}
    {v.status === 'COMPLETED' && v.report === 'PENDING' && can('report') && <button onClick={() => open('report', v)} className="rounded bg-blue-900 px-2 py-1 text-xs text-white">Submit report</button>}
    {v.report === 'SUBMITTED' && can('review') && <button onClick={() => open('review', v)} className="rounded bg-emerald-700 px-2 py-1 text-xs text-white">Mark reviewed</button>}</span>)
  const vb = (v) => <Badge value={v.status === 'CANCELLED' ? 'DONE' : v.status === 'COMPLETED' ? 'ON_TRACK' : v.delayed ? 'OVERDUE' : 'INFO'} label={v.delayed ? 'DELAYED' : v.status} />
  const visits = data.visits, list = visits.filter((v) => (!st || v.status === st) && (!q || `${v.id} ${v.appId} ${v.institution}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.when - b.when)
  const agenda = visits.filter((v) => v.status !== 'CANCELLED').sort((a, b) => a.when - b.when), cnt = (s) => visits.filter((v) => v.status === s).length
  return (<div className="space-y-3"><h1 className="text-lg font-semibold text-blue-900">Expert Visit Committee (EVC)</h1>
    <p className="text-xs text-slate-500">Fictional committee members and demo dates. Changes live in browser memory only and reset on refresh. Your role: {ROLES[role]}{!can('schedule') && !can('complete') && !can('report') && ' (view only)'}.</p>
    {msg && <p className="text-sm text-emerald-700">{msg}</p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Awaiting scheduling', data.eligible.length], ['Scheduled', cnt('SCHEDULED')], ['Delayed', visits.filter((v) => v.delayed).length], ['Completed', cnt('COMPLETED')]].map(([l, n]) => <div key={l} className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">{l}</div><div className="text-xl font-semibold text-blue-900">{n}</div></div>)}</div>
    <div className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="mb-2 text-sm font-semibold text-slate-700">Applications awaiting EVC scheduling</h3>{data.eligible.length === 0 ? <p className="text-sm text-slate-500">No applications are waiting for an EVC visit.</p> : data.eligible.map((a) => <div key={a.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm"><span><Link to={`/applications/${a.id}`} className="font-semibold text-blue-900 hover:underline">{a.id}</Link> · {a.institution}</span>{can('schedule') ? <button onClick={() => open('schedule', a)} className="rounded bg-blue-900 px-2 py-1 text-xs text-white">Schedule visit</button> : <span className="text-xs text-slate-400">Scheduling: Super Admin / Regional Officer</span>}</div>)}</div>
    <div className="flex gap-2 text-sm">{[['schedule', 'Schedule view'], ['cases', 'Case list']].map(([k, l]) => <button key={k} onClick={() => setView(k)} className={`rounded border px-3 py-1 ${view === k ? 'border-blue-800 bg-blue-50 text-blue-900' : ''}`}>{l}</button>)}</div>
    {view === 'schedule' ? (agenda.length === 0 ? <p className="rounded-lg border bg-white p-6 text-center text-sm text-slate-500">No scheduled or completed visits for this role.</p> : agenda.map((v) => <div key={v.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"><div className="text-sm"><div className="font-medium">{fmt(v.when)} {vb(v)}</div><div><Link to={`/applications/${v.appId}`} className="text-blue-800 hover:underline">{v.appId}</Link> · {v.institution}</div><div className="text-xs text-slate-500">{v.id} · {v.members.join(', ')} · Report: {RL[v.report]}</div><div className="text-xs text-slate-600">Outstanding: {v.outstanding}</div></div><Acts v={v} /></div>)) :
      <div className="space-y-2"><div className="flex flex-wrap gap-2 rounded-lg border bg-white p-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search visit, application, institution" className="w-72 rounded border px-2 py-1.5 text-sm" /><select value={st} onChange={(e) => setSt(e.target.value)} className="rounded border bg-white px-2 py-1.5 text-sm"><option value="">All statuses</option>{['SCHEDULED', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4">{list.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No visits match.</p> : <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500">{['Visit', 'Application', 'When', 'Status', 'Committee', 'Report', 'Outstanding', 'Actions'].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{list.map((v) => <tr key={v.id} className="border-b border-slate-100"><td className="py-2 pr-3">{v.id}</td><td className="pr-3"><Link to={`/applications/${v.appId}`} className="text-blue-800 hover:underline">{v.appId}</Link><div className="text-xs text-slate-400">{v.institution}</div></td><td className="pr-3">{fmt(v.when)}</td><td className="pr-3">{vb(v)}{v.cancelReason && <div className="text-xs text-slate-400">{v.cancelReason}</div>}</td><td className="pr-3">{v.members.join(', ')}</td><td className="pr-3">{RL[v.report]}</td><td className="pr-3">{v.outstanding}</td><td><Acts v={v} /></td></tr>)}</tbody></table>}</div></div>}
    {dlg && <Modal title={TITLE[dlg.kind]} confirmLabel={dlg.kind === 'cancel' ? 'Cancel visit' : 'Confirm'} onCancel={() => setDlg(null)} onConfirm={run} busy={busy}>
      <p className="mb-2 text-sm text-slate-600">{dlg.t.id}{dlg.t.institution ? ` · ${dlg.t.institution}` : ''}</p>
      {['schedule', 'reschedule'].includes(dlg.kind) && <><input type="datetime-local" min={minNow()} value={f.when} onChange={set('when')} className="w-full rounded border p-2 text-sm" /><div className="mt-2 text-xs text-slate-500">Committee members (2 to 5)</div>{COMMITTEE.map((m) => <label key={m} className="mr-3 inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={f.members.includes(m)} onChange={() => setF({ ...f, members: f.members.includes(m) ? f.members.filter((x) => x !== m) : [...f.members, m] })} />{m}</label>)}</>}
      {['reschedule', 'cancel'].includes(dlg.kind) && <textarea value={f.reason} onChange={set('reason')} rows={2} placeholder="Reason (required)" className={ta} />}
      {dlg.kind === 'complete' && <p className="text-sm">Confirm that this visit has taken place. A report will then be due from the committee.</p>}
      {dlg.kind === 'report' && <><textarea value={f.obs} onChange={set('obs')} rows={3} placeholder="Visit observations (min 10 characters)" className={ta} /><textarea value={f.rec} onChange={set('rec')} rows={2} placeholder="Recommendation to the committee (advisory, min 10 characters)" className={ta} /></>}
      {dlg.kind === 'review' && <><p className="text-sm text-slate-600">{dlg.t.reportData?.observations}</p><textarea value={f.remarks} onChange={set('remarks')} rows={2} placeholder="Review remarks (optional)" className={ta} /></>}
      {derr && <p className="mt-2 text-sm text-red-700">{derr}</p>}</Modal>}</div>)
}
