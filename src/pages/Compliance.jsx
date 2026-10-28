import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCompliance, reviewEvidence, submitEvidence } from '../services/applications'
import { useRole } from '../context/RoleContext'
import { useDataVersion } from '../hooks/useDataVersion'
import { COMPLIANCE_PERMS, ROLES, canAccess } from '../config/roles'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
const ts = (t) => new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const dt = (t) => new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const statusOf = (r) => (r.overdue ? 'OVERDUE' : r.state === 'SUBMITTED' ? 'AWAITING_REVIEW' : r.state)
const EV = { NOT_SUBMITTED: ['DONE', 'Not submitted'], SUBMITTED: ['ON_TRACK', 'Submitted'], VERIFIED: ['ON_TRACK', 'Submitted'], REJECTED: ['OVERDUE', 'Resubmission needed'] }
const VR = { NOT_SUBMITTED: ['DONE', 'n/a'], SUBMITTED: ['AT_RISK', 'Awaiting review'], VERIFIED: ['ON_TRACK', 'Verified'], REJECTED: ['OVERDUE', 'Rejected'] }
export default function Compliance() {
  const { role } = useRole(), ver = useDataVersion(), [rows, setRows] = useState(null), [err, setErr] = useState(null), [q, setQ] = useState(''), [st, setSt] = useState(''), [open, setOpen] = useState(null)
  const [dlg, setDlg] = useState(null), [file, setFile] = useState(null), [note, setNote] = useState(''), [derr, setDerr] = useState(null), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false)
  useEffect(() => { if (canAccess(role, 'compliance')) listCompliance(role).then(setRows).catch(setErr) }, [role, ver])
  if (!canAccess(role, 'compliance')) return <p className="rounded-lg border bg-white p-6 text-sm text-slate-600">The {ROLES[role]} demo role does not have access to compliance records.</p>
  if (err) return <p className="text-sm text-red-700">Could not load compliance records. Please refresh.</p>
  if (!rows) return <p className="text-sm text-slate-500">Loading compliance records...</p>
  const canSubmit = COMPLIANCE_PERMS.submit.includes(role), canReview = COMPLIANCE_PERMS.review.includes(role)
  const shown = rows.filter((r) => (!st || statusOf(r) === st) && (!q || `${r.id} ${r.appId} ${r.institution} ${r.title}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.due - b.due)
  const start = (kind, r, decision) => { setDlg({ kind, r, decision }); setFile(null); setNote(''); setDerr(null); setMsg(null) }
  const run = async () => { setBusy(true); setDerr(null)
    try { if (dlg.kind === 'submit') await submitEvidence(dlg.r.id, role, { fileName: file?.name, fileSize: file?.size, note }); else await reviewEvidence(dlg.r.id, role, dlg.decision, note)
      setMsg({ t: dlg.kind === 'submit' ? `Evidence metadata for ${dlg.r.id} recorded (simulated).` : `${dlg.r.id} ${dlg.decision.toLowerCase()} (simulated).` }); setDlg(null) } catch (e) { setDerr(e.message) } setBusy(false) }
  return (<div className="space-y-3"><h1 className="text-lg font-semibold text-blue-900">Compliance</h1>
    <p className="text-xs text-slate-500">Demo records. Uploaded files are not stored; only the file name and size are kept in browser memory until refresh. Your role: {ROLES[role]}{!canSubmit && !canReview && ' (monitoring only)'}. Due dates are demo values.</p>
    {msg && <p className="text-sm text-emerald-700">{msg.t}</p>}
    <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search record, application, institution" className="w-72 rounded border px-2 py-1.5 text-sm" />
      <select value={st} onChange={(e) => setSt(e.target.value)} className="rounded border bg-white px-2 py-1.5 text-sm"><option value="">All statuses</option>{['OVERDUE', 'NOT_SUBMITTED', 'AWAITING_REVIEW', 'VERIFIED', 'REJECTED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select>
      <span className="self-center text-xs text-slate-500">{shown.filter((r) => r.overdue).length} overdue · {shown.filter((r) => r.state === 'REJECTED').length} rejected</span></div>
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4">{shown.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No compliance records for this role and filter.</p> :
      <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500">{['Application', 'Institution', 'Requirement', 'Deadline', 'Evidence', 'Verification', 'Verifier', 'Updated', 'Actions'].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{shown.map((r) => <Fragment key={r.id}><tr className="border-b border-slate-100"><td className="py-2 pr-3"><Link to={`/applications/${r.appId}`} className="font-semibold text-blue-900 hover:underline">{r.appId}</Link><div className="text-xs text-slate-400">{r.id}</div></td><td className="pr-3">{r.institution}</td><td className="pr-3">{r.title}</td>
          <td className="pr-3 whitespace-nowrap">{dt(r.due)} {r.overdue && <Badge value="OVERDUE" label={`${-r.daysToDue}d late`} />}</td><td className="pr-3"><Badge value={EV[r.state][0]} label={EV[r.state][1]} /></td><td className="pr-3"><Badge value={VR[r.state][0]} label={VR[r.state][1]} /></td><td className="pr-3">{r.verifier}</td><td className="pr-3 whitespace-nowrap">{ts(r.updated)}</td>
          <td className="space-x-1 whitespace-nowrap"><button onClick={() => setOpen(open === r.id ? null : r.id)} className="rounded border px-2 py-1 text-xs">History</button>
            {canSubmit && ['NOT_SUBMITTED', 'REJECTED'].includes(r.state) && <button onClick={() => start('submit', r)} className="rounded bg-blue-900 px-2 py-1 text-xs text-white">Submit evidence</button>}
            {canReview && r.state === 'SUBMITTED' && <><button onClick={() => start('review', r, 'VERIFIED')} className="rounded bg-emerald-700 px-2 py-1 text-xs text-white">Verify</button><button onClick={() => start('review', r, 'REJECTED')} className="rounded bg-red-700 px-2 py-1 text-xs text-white">Reject</button></>}</td></tr>
          {open === r.id && <tr className="bg-slate-50"><td colSpan={9} className="p-3 text-xs">{r.history.length === 0 ? 'No submissions or reviews yet.' : r.history.map((h, i) => <div key={i} className="py-0.5">{ts(h.ts)} · {h.by} · <b>{h.kind}</b>{h.fileName && ` · ${h.fileName}`} · {h.note}</div>)}</td></tr>}</Fragment>)}</tbody></table>}</div>
    {dlg && <Modal title={dlg.kind === 'submit' ? 'Submit evidence' : `${dlg.decision === 'VERIFIED' ? 'Verify' : 'Reject'} evidence`} confirmLabel={dlg.kind === 'submit' ? 'Submit' : dlg.decision === 'VERIFIED' ? 'Verify' : 'Reject'} onCancel={() => setDlg(null)} onConfirm={run} busy={busy}>
      <p className="mb-2 text-sm text-slate-600">{dlg.r.id}: {dlg.r.title}</p>
      {dlg.kind === 'submit' && <input type="file" onChange={(e) => setFile(e.target.files[0] || null)} className="mb-2 block w-full text-sm" />}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={dlg.decision === 'REJECTED' ? 'Remarks (required)' : 'Remarks (optional)'} className="w-full rounded border p-2 text-sm" />{derr && <p className="mt-2 text-sm text-red-700">{derr}</p>}</Modal>}</div>)
}
