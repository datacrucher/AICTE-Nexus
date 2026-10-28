import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { PAGE_SIZE, applicationsApi } from '../services/applicationsApi'
import { STAGES } from '../config/workflow'
import Badge from '../components/Badge'
import { useAuth } from '../context/AuthContext'
const F0 = { q: '', stage: '', region: '', sla: '', risk: '', institution: '' }
const Sel = ({ v, set, all, opts }) => <select value={v} onChange={(e) => set(e.target.value)} className="rounded border bg-white px-2 py-1.5 text-sm"><option value="">{all}</option>{opts.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}</select>
export default function Applications() {
  const navigate = useNavigate(), { role } = useAuth()
  const [createOpen, setCreateOpen] = useState(false), [newType, setNewType] = useState('Extension of Approval'), [newRemarks, setNewRemarks] = useState(''), [creating, setCreating] = useState(false), [createErr, setCreateErr] = useState('')
  const [f, setF] = useState(F0), [pg, setPg] = useState(0), [data, setData] = useState({ rows: [], total: 0 }), [loading, setLoading] = useState(true), [err, setErr] = useState(null), [look, setLook] = useState({ institutions: [], regions: [] })
  useEffect(() => { applicationsApi.lookups().then(setLook).catch(() => {}) }, [])
  useEffect(() => {
    let live = true; setLoading(true)
    const t = setTimeout(() => { applicationsApi.list({ ...f, page: pg }).then((r) => { if (live) { setData(r); setErr(null) } }).catch((e) => live && setErr(e.message)).finally(() => live && setLoading(false)) }, f.q ? 300 : 0)
    return () => { live = false; clearTimeout(t) }
  }, [f, pg])
  const up = (k) => (v) => { setF((p) => ({ ...p, [k]: v })); setPg(0) }
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  return (<div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-lg font-semibold text-blue-900">Applications</h1>{role === 'institution' && <button onClick={() => { setCreateOpen(!createOpen); setCreateErr('') }} className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">+ Submit new application</button>}</div>
    {createOpen && role === 'institution' && <form onSubmit={async (e) => { e.preventDefault(); setCreating(true); setCreateErr(''); try { const created = await applicationsApi.create({ application_type: newType, remarks: newRemarks }); navigate(`/applications/${created.id}`) } catch (e) { setCreateErr(e.message || 'Could not submit application') } finally { setCreating(false) } }} className="space-y-3 rounded-lg border border-orange-200 bg-white p-4">
      <h2 className="font-semibold text-blue-900">Submit an application</h2><p className="text-xs text-slate-500">Fictional demo record. Submitting creates a database record and audit entry and sends it to the scrutiny queue.</p>
      <label className="block text-sm font-medium text-slate-700">Application type<select value={newType} onChange={(e) => setNewType(e.target.value)} className="mt-1 block w-full rounded border border-slate-300 p-2"><option>New Institution</option><option>Extension of Approval</option><option>Intake Increase</option><option>New Course</option></select></label>
      <label className="block text-sm font-medium text-slate-700">Submission note (optional)<textarea value={newRemarks} onChange={(e) => setNewRemarks(e.target.value)} maxLength={2000} rows={2} placeholder="Add a short note for the scrutiny team" className="mt-1 block w-full rounded border border-slate-300 p-2"/></label>
      {createErr && <p className="text-sm text-red-700">{createErr}</p>}<div className="flex gap-2"><button disabled={creating} className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{creating ? 'Submitting…' : 'Submit to scrutiny'}</button><button type="button" onClick={() => setCreateOpen(false)} className="rounded border px-4 py-2 text-sm">Cancel</button></div>
    </form>}
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className="relative"><Search size={14} className="absolute left-2 top-2.5 text-slate-400" /><input value={f.q} onChange={(e) => up('q')(e.target.value)} placeholder="Search ID, institution, region, officer" className="w-72 rounded border py-1.5 pl-7 pr-2 text-sm" /></div>
      <Sel v={f.stage} set={up('stage')} all="All stages" opts={[...STAGES, 'REJECTED']} /><Sel v={f.region} set={up('region')} all="All regions" opts={look.regions} />
      <Sel v={f.sla} set={up('sla')} all="All SLA" opts={['ON_TRACK', 'AT_RISK', 'OVERDUE']} /><Sel v={f.risk} set={up('risk')} all="All risk" opts={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']} />
      <Sel v={f.institution} set={up('institution')} all="All institutions" opts={look.institutions} />
      <button onClick={() => { setF(F0); setPg(0) }} className="text-sm text-blue-800">Clear</button></div>
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {err ? <div className="py-4 text-sm text-red-700">Could not load applications: {err} <button onClick={() => setF({ ...f })} className="ml-2 text-blue-800 underline">Retry</button></div>
        : loading && data.rows.length === 0 ? <p className="text-sm text-slate-500">Loading applications...</p>
        : data.rows.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No applications match these filters for your account.</p> :
        <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500">{['Application', 'Institution', 'Region', 'Stage', 'Officer', 'SLA', 'Risk score'].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{data.rows.map((a) => <tr key={a.dbId} onClick={() => navigate(`/applications/${a.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/applications/${a.id}`)} tabIndex={0} role="link" aria-label={`Open application ${a.id}`} className="cursor-pointer border-b border-slate-100 hover:bg-orange-50 focus:bg-orange-50"><td className="py-2 pr-3"><Link className="font-semibold text-blue-900 hover:underline" to={`/applications/${a.id}`}>{a.id}</Link></td><td className="pr-3">{a.institution}</td><td className="pr-3">{a.region}</td><td className="pr-3">{a.stage.replace(/_/g, ' ')}</td><td className="pr-3">{a.officer}</td>
            <td className="pr-3"><Badge value={a.slaStatus} /></td><td><Badge value={a.risk} label={`${a.risk} (${a.riskScore})`} /></td></tr>)}</tbody></table></div>}
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{data.total} result(s)</span><span className="space-x-2"><button disabled={pg === 0} onClick={() => setPg(pg - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Prev</button><span>Page {pg + 1} of {pages}</span><button disabled={pg + 1 >= pages} onClick={() => setPg(pg + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next</button></span></div></div></div>)
}
