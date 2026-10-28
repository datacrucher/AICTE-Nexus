import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { applicationsApi } from '../services/applicationsApi'
import { useAuth } from '../context/AuthContext'
import { docStatus } from '../lib/sla'
import { followUps } from '../lib/summary'
import { fmtDate } from '../lib/dates'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
const Box = ({ title, children }) => <div className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>{children}</div>
const ts = (t) => new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const daysTo = (d) => Math.round((Date.parse(d) - Date.parse(new Date().toISOString().slice(0, 10))) / 864e5)
export default function ApplicationDetail() {
  const { id } = useParams(), { role } = useAuth()   // the role here is the database-derived role, never the dev preview
  const [a, setA] = useState(undefined), [d, setD] = useState(null), [err, setErr] = useState(null), [tab, setTab] = useState('Overview'), [defs, setDefs] = useState([])
  const [uploadFile, setUploadFile] = useState(null), [docType, setDocType] = useState('FACULTY'), [docBusy, setDocBusy] = useState(false), [docMsg, setDocMsg] = useState(null)
  const [confirm, setConfirm] = useState(null), [remarks, setRemarks] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null)
  const load = useCallback(async () => { try { const x = await applicationsApi.get(id); if (!x) { setA(null); return } const det = await applicationsApi.detail(x); setA(x); setD(det); setErr(null) } catch (e) { setErr(e.message) } }, [id])
  useEffect(() => { setA(undefined); setErr(null); load() }, [load])
  useEffect(() => { applicationsApi.actions().then(setDefs).catch(() => setDefs([])) }, [])
  if (err) return <div className="text-sm text-red-700">Could not load this application: {err} <button onClick={load} className="ml-2 text-blue-800 underline">Retry</button></div>
  if (a === undefined || (a && !d)) return <p className="text-sm text-slate-500">Loading application...</p>
  if (a === null) return <div className="text-sm"><p className="text-slate-600">Application not found, or not visible to your account.</p><Link to="/applications" className="text-blue-800">Back to applications</Link></div>
  const actions = defs.filter((x) => x.role === role && x.from_stage === a.stage)
  const run = async () => { setBusy(true); try { await applicationsApi.transition(a.dbId, confirm.action_id, remarks); setMsg({ ok: true, t: `${confirm.label}: saved. The database recorded the stage change and audit event.` }); await load() } catch (e) { setMsg({ ok: false, t: e.message }) } setBusy(false); setConfirm(null); setRemarks('') }
  const tabs = {
    Overview: <div className="space-y-4"><div className="grid grid-cols-2 gap-3 text-sm">{[['Type', a.type], ['Region', a.region], ['Submitted', a.submittedOn], ['Days pending', a.daysPending ?? '—'], ['Days in stage', a.daysInStage], ['Stage SLA (demo)', `${a.sla} days`], ['Stage deadline', a.remaining == null ? 'n/a' : fmtDate(a.remaining)], ['Assigned officer', a.officer], ['Priority', a.priority]].map(([k, v]) => <div key={k}><div className="text-xs text-slate-500">{k}</div><div className="font-medium">{v}</div></div>)}</div>
      <div><div className="mb-1 text-xs font-semibold text-slate-600">Observations</div>{d.observations.length === 0 ? <p className="text-sm text-slate-500">No observations on record.</p> : d.observations.map((o) => <div key={o.n} className="flex justify-between border-b py-1.5 text-sm"><span>#{o.n} {o.text}</span><Badge value={o.status === 'OPEN' ? 'AT_RISK' : 'ON_TRACK'} label={o.status} /></div>)}</div></div>,
    Documents: <div className="space-y-4">
      {role === 'institution' && <form onSubmit={async (e) => {
        e.preventDefault(); if (!uploadFile) return;
        setDocBusy(true); setDocMsg(null);
        try { await applicationsApi.uploadDocument(a.id, uploadFile, docType); setUploadFile(null); e.target.reset(); setDocMsg({ok:true,text:'Document uploaded and saved. It is now pending verification.'}); await load() }
        catch (e) { setDocMsg({ok:false,text:e.message}) } finally { setDocBusy(false) }
      }} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Upload supporting document</h3>
        <p className="mb-3 text-xs text-slate-500">PDF only · maximum 10 MB · uploaded files are saved by the backend.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <select aria-label="Document type" value={docType} onChange={e=>setDocType(e.target.value)} className="rounded border border-slate-300 bg-white p-2 text-sm">
            <option value="FACULTY">Faculty details</option><option value="INFRASTRUCTURE">Infrastructure evidence</option><option value="AFFIDAVIT">Affidavit</option><option value="APPROVAL">Approval document</option><option value="OTHER">Other</option>
          </select>
          <input aria-label="PDF document" type="file" accept="application/pdf,.pdf" onChange={e=>setUploadFile(e.target.files?.[0] || null)} className="min-w-0 rounded border border-slate-300 bg-white p-2 text-xs" required />
          <button disabled={docBusy || !uploadFile} className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{docBusy ? 'Uploading…' : 'Upload PDF'}</button>
        </div>
      </form>}
      {docMsg && <p role="status" className={`text-sm ${docMsg.ok?'text-emerald-700':'text-red-700'}`}>{docMsg.text}</p>}
      {d.documents.length === 0 ? <p className="text-sm text-slate-500">No documents on record.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2 pr-3">Document</th><th className="pr-3">Expiry</th><th className="pr-3">Verification</th><th className="pr-3">Validity</th><th>Actions</th></tr></thead><tbody>{d.documents.map((x) => { const s = x.expiry_date ? docStatus(daysTo(x.expiry_date)) : 'VALID'; return <tr key={x.id} className="border-b border-slate-100"><td className="py-2 pr-3">{x.doc_type.replace(/_/g, ' ')}{x.file_name && <div className="text-xs text-slate-400">{x.file_name}</div>}</td><td className="pr-3">{x.expiry_date ? fmtDate(daysTo(x.expiry_date)) : '—'}</td><td className="pr-3">{x.verification_status}</td><td className="pr-3"><Badge value={s === 'VALID' ? 'ON_TRACK' : s === 'EXPIRED' ? 'OVERDUE' : 'AT_RISK'} label={s} /></td><td><div className="flex flex-wrap gap-2">
        {x.has_file && x.file_name && <button type="button" onClick={()=>{const target=`nexus-download-${Date.now()}`;const popup=window.open('about:blank',target);if(!popup){setDocMsg({ok:false,text:'Allow pop-ups for this site, then try downloading again.'});return}setDocMsg(null);void (async()=>{try{const {ticket}=await applicationsApi.createDownloadTicket(a.id,x.id);const form=document.createElement('form');form.method='POST';form.action=applicationsApi.downloadDocumentUrl(a.id,x.id);form.target=target;const input=document.createElement('input');input.type='hidden';input.name='ticket';input.value=ticket;form.appendChild(input);document.body.appendChild(form);form.submit();form.remove()}catch(e){popup.close();setDocMsg({ok:false,text:e.message})}})()}} className="text-xs font-semibold text-blue-800 underline">Download</button>}
        {['admin','regional','scrutiny'].includes(role) && x.verification_status === 'PENDING' && <><button type="button" onClick={async()=>{try{await applicationsApi.verifyDocument(a.id,x.id,'VERIFIED');setDocMsg({ok:true,text:'Document verified.'});await load()}catch(e){setDocMsg({ok:false,text:e.message})}}} className="text-xs font-semibold text-emerald-700 underline">Verify</button><button type="button" onClick={async()=>{try{await applicationsApi.verifyDocument(a.id,x.id,'REJECTED');setDocMsg({ok:true,text:'Document rejected.'});await load()}catch(e){setDocMsg({ok:false,text:e.message})}}} className="text-xs font-semibold text-red-700 underline">Reject</button></>}
      </div></td></tr> })}</tbody></table></div>}
    </div>,
    Timeline: <ol className="ml-2 space-y-4 border-l-2 border-blue-200">{d.timeline.map((e) => <li key={e.id} className="relative ml-4"><span className="absolute -left-[22px] top-1 h-3 w-3 rounded-full bg-blue-800" /><div className="text-sm font-medium">{e.to.replace(/_/g, ' ')} <span className="font-normal text-slate-500">· {e.action}</span></div><div className="text-xs text-slate-500">{ts(e.ts)} · {e.actor}{e.simulated && ' · seeded demo data'}{e.remarks && !e.simulated && ` · ${e.remarks}`}</div></li>)}</ol>,
    'Audit Trail': <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500">{['Time', 'Actor', 'Action', 'Change', 'Remarks'].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}</tr></thead><tbody>{d.audit.map((e) => <tr key={e.id} className="border-b border-slate-100"><td className="py-2 pr-3 whitespace-nowrap">{ts(e.ts)}</td><td className="pr-3">{e.actor}</td><td className="pr-3">{e.action}</td><td className="pr-3">{e.from} → {e.to}</td><td>{e.remarks}</td></tr>)}</tbody></table><p className="mt-2 text-xs text-slate-400">Persisted audit events. Append-only for application users, but not tamper-proof against the database owner.</p></div>,
  }
  return (<div className="space-y-4"><Link to="/applications" className="text-sm text-blue-800">← Applications</Link>
    <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex flex-wrap justify-between gap-3"><div><div className="text-lg font-semibold text-blue-900">{a.id}</div><div className="text-sm text-slate-600">{a.institution} · {a.type}</div></div>
      <div className="flex flex-wrap items-center gap-2"><Badge value="INFO" label={a.stage.replace(/_/g, ' ')} /><Badge value={a.slaStatus} /><Badge value={a.risk} label={`Risk: ${a.risk}`} /></div></div>
      <p className="mt-2 text-xs text-slate-400">Data comes from the database (fictional demo seed). SLA, risk and escalation are computed server-side from configurable demo values, not official AICTE rules.</p>
      {actions.length > 0 && <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">{actions.map((x) => <button key={x.action_id} onClick={() => { setMsg(null); setConfirm(x) }} className="rounded bg-blue-900 px-3 py-1.5 text-sm text-white">{x.label}</button>)}</div>}
      {msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.t}</p>}</div>
    <div className="grid gap-4 lg:grid-cols-3"><div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2"><div className="mb-4 flex gap-4 border-b text-sm">{Object.keys(tabs).map((t) => <button key={t} onClick={() => setTab(t)} className={`pb-2 ${tab === t ? 'border-b-2 border-blue-800 font-medium text-blue-900' : 'text-slate-500'}`}>{t}</button>)}</div>{tabs[tab]}</div>
      <div className="space-y-4"><Box title={`Risk score ${a.riskScore} (${a.risk})`}><ul className="ml-4 list-disc space-y-1 text-sm">{(a.riskReasons.length ? a.riskReasons : ['No risk factors detected']).map((r) => <li key={r}>{r}</li>)}</ul></Box>
        <Box title="Suggested follow-ups (rule-based)"><ol className="ml-4 list-decimal space-y-1 text-sm">{followUps(a).map((r) => <li key={r}>{r}</li>)}</ol><p className="mt-2 text-xs text-slate-400">Hints only. Decisions rest with authorized officials.</p></Box></div></div>
    {confirm && <Modal title={confirm.label} onCancel={() => setConfirm(null)} onConfirm={run} busy={busy}><p className="mb-2 text-sm text-slate-600">{a.stage.replace(/_/g, ' ')} → {confirm.to_stage.replace(/_/g, ' ')}. The database checks your role and the current stage and records the change atomically.</p><textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder="Remarks (stored in the audit log)" className="w-full rounded border p-2 text-sm" /></Modal>}</div>)
}
