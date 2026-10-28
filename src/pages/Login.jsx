import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Brand, Tricolour } from '../components/Layout'
import { ROLES } from '../config/roles'

const roleCopy = {
  admin: ['System Administrator', 'Oversee workflows, monitor activity and review traceable administrative actions.'],
  regional: ['Regional Officer', 'Monitor regional application movement, pendency and escalations.'],
  scrutiny: ['Scrutiny Officer', 'Review application details, record observations and follow resubmissions.'],
  institution: ['Institution Workspace', 'Track applications, respond to observations and manage compliance submissions.'],
  evc: ['EVC Committee Workspace', 'Access visit coordination, committee tasks and report milestones.'],
}
export default function Login() {
  const a = useAuth(), nav = useNavigate(), loc = useLocation(), [params] = useSearchParams()
  const requestedRole = params.get('role')
  const role = Object.hasOwn(ROLES, requestedRole) ? requestedRole : null
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [showPw, setShowPw] = useState(false), [err, setErr] = useState(null), [busy, setBusy] = useState(false), [demoBusy, setDemoBusy] = useState(null)
  if (a.session && a.access.ok) return <Navigate to="/dashboard" replace />
  const submit = async (e) => { e.preventDefault(); setBusy(true); setErr(null); const { error } = await a.signIn(email.trim(), pw); setBusy(false); if (error) setErr(error); else nav(loc.state?.from || '/dashboard', { replace: true }) }
  const enterDemo = async (demoRole) => {
    setDemoBusy(demoRole); setErr(null)
    const { error } = await a.signInDemo(demoRole)
    setDemoBusy(null)
    if (error) setErr(error)
    else nav('/dashboard', { replace: true })
  }
  const title = role ? roleCopy[role]?.[0] || ROLES[role] : 'Sign in to your workspace'
  const description = role ? roleCopy[role]?.[1] : 'Choose your authorized account to access the AICTE Nexus workspace.'
  return <div className="flex min-h-screen flex-col bg-[#FDFBF7] text-[#17264F]"><Tricolour />
    <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><Link to="/"><Brand /></Link><Link to="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"><ArrowLeft size={16} /> <span className="hidden sm:inline">Back to home</span><span className="sm:hidden">Home</span></Link></div></header>
    <main className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[1.1fr_.9fr] lg:gap-12"><section className="mx-auto w-full max-w-xl"><div className="mb-7"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#0D947F]">AICTE Nexus workspace access</p><h1 className="mt-3 text-3xl font-black tracking-tight text-[#17264F] sm:text-4xl">{title}</h1><p className="mt-3 leading-7 text-slate-600">{description}</p></div>
      <form onSubmit={submit} className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-[0_20px_60px_-35px_rgba(23,38,79,.35)]"><div className="bg-gradient-to-r from-[#F47716] to-[#E95D0B] p-5 text-white sm:p-6"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20"><ShieldCheck size={25} /></div><div><p className="text-xs font-bold uppercase tracking-wider text-white/80">Secure portal access</p><p className="mt-1 text-xl font-extrabold">{role ? ROLES[role] : 'Authorized users'}</p></div></div></div><div className="space-y-5 p-5 sm:p-7"><div><label htmlFor="email" className="mb-2 block text-xs font-extrabold uppercase tracking-wide text-slate-600">Email address</label><div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-[#0D947F] focus-within:ring-4 focus-within:ring-emerald-50"><Mail size={18} className="shrink-0 text-slate-400" /><input id="email" type="email" required autoComplete="username" placeholder="name@organization.gov.in" value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-slate-400" /></div></div><div><div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="password" className="block text-xs font-extrabold uppercase tracking-wide text-slate-600">Password</label><span className="text-xs font-medium text-slate-400">Account credentials</span></div><div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-[#0D947F] focus-within:ring-4 focus-within:ring-emerald-50"><LockKeyhole size={18} className="shrink-0 text-slate-400" /><input id="password" type={showPw?'text':'password'} required autoComplete="current-password" placeholder="Enter your password" value={pw} onChange={e=>setPw(e.target.value)} className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-slate-400" /><button type="button" onClick={()=>setShowPw(v=>!v)} aria-label={showPw?'Hide password':'Show password'} className="text-slate-400 hover:text-[#17264F]">{showPw?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></div>{err && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</p>}<button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0D947F] px-5 py-4 text-sm font-extrabold text-white shadow-md shadow-emerald-100 transition hover:bg-[#087D6D] disabled:cursor-wait disabled:opacity-60">{busy?'Signing in…':'Sign in to workspace'} <ArrowRight size={17}/></button><p className="text-center text-xs leading-5 text-slate-500">Access is limited to accounts created or authorized by the system administrator.</p></div></form>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3"><p className="text-sm font-extrabold text-[#17264F]">Explore with a demo account</p><p className="mt-1 text-xs leading-5 text-slate-500">Choose a role to enter its sample workspace without typing credentials. Demo access is for local development only.</p></div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[['admin','Super Admin'],['regional','Regional Officer'],['scrutiny','Scrutiny Officer'],['institution','Institution'],['evc','EVC Committee']].map(([key,label]) =>
            <button key={key} type="button" disabled={Boolean(demoBusy)} onClick={() => enterDemo(key)} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-left text-sm font-bold text-[#17264F] transition hover:border-[#F47716] hover:bg-[#FFF7EF] disabled:opacity-60">
              <span>{label}</span><span className="text-[#0D947F]">{demoBusy === key ? 'Opening…' : 'Continue →'}</span>
            </button>
          )}
        </div>
      </section>
      {role && <div className="mt-5 text-center text-sm text-slate-500">Wrong workspace? <Link to="/login" className="font-bold text-[#0D8474] hover:underline">Choose another login role</Link></div>}</section>
      <aside className="relative hidden min-h-[530px] overflow-hidden rounded-[2rem] border border-[#0D947F]/15 bg-gradient-to-br from-[#E8F6F1] via-white to-[#FFF0E2] p-8 lg:flex lg:flex-col lg:justify-between xl:p-10"><div className="absolute -right-20 -top-16 h-72 w-72 rounded-full border border-[#0D947F]/15"/><div className="absolute -right-8 -top-4 h-48 w-48 rounded-full border border-[#F47716]/20"/><div className="relative"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#0D947F] shadow-sm"><ShieldCheck size={27}/></div><p className="mt-8 text-xs font-extrabold uppercase tracking-[.18em] text-[#0D8474]">A connected process</p><h2 className="mt-3 max-w-md text-3xl font-black leading-tight tracking-tight">Every stage visible. Every action accountable.</h2><p className="mt-4 max-w-md leading-7 text-slate-600">AICTE Nexus brings approval workflows, compliance milestones and administrative follow-ups into a structured workspace.</p></div><div className="relative space-y-3">{[{n:'01',t:'Application workflow',d:'Scrutiny, observations and resubmissions'},{n:'02',t:'Deadline awareness',d:'Compliance dates and pending actions'},{n:'03',t:'Traceable administration',d:'Recorded activity and accountable decisions'}].map(x=><div key={x.n} className="flex items-center gap-4 rounded-2xl border border-white bg-white/85 p-4 shadow-sm"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E2] text-sm font-black text-[#E86D12]">{x.n}</span><div><p className="font-extrabold">{x.t}</p><p className="mt-1 text-xs text-slate-500">{x.d}</p></div></div>)}</div></aside>
    </main></div>
}
