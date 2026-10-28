import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BellRing, CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck,
  FileCheck2, Landmark, Menu, ShieldCheck, Workflow, FileSearch, Building2,
  ChartNoAxesCombined, Users, Clock3, CircleHelp, Search, Activity, FileClock
} from 'lucide-react'
import { ROLES } from '../config/roles'
import { Brand, Tricolour } from '../components/Layout'

const roleIcons = { admin: ShieldCheck, regional: Landmark, scrutiny: FileSearch, institution: Building2, evc: CalendarDays }
const roleDescriptions = {
  admin: 'System oversight, workflow visibility and decision audit trails.',
  regional: 'Monitor regional pendency, escalations and application movement.',
  scrutiny: 'Review applications, record observations and track resubmissions.',
  institution: 'Follow application status and respond to observations or compliance requests.',
  evc: 'Coordinate committee visits, reports and review milestones.',
}
const capabilities = [
  { icon: Workflow, title: 'Approval workflow tracking', text: 'Follow applications through scrutiny, observations, resubmission, committee review and final decision.' },
  { icon: ChartNoAxesCombined, title: 'Pendency & workload visibility', text: 'Surface pending work, ageing cases and process bottlenecks so teams can prioritise follow-ups.' },
  { icon: CalendarDays, title: 'EVC coordination', text: 'Keep visit schedules, committee assignments and report milestones visible in one workflow.' },
  { icon: ClipboardCheck, title: 'Compliance monitoring', text: 'Track time-bound submissions, evidence review and document validity in a structured workspace.' },
  { icon: BellRing, title: 'Alerts & escalation', text: 'Highlight approaching deadlines and overdue actions for the appropriate officials.' },
  { icon: FileCheck2, title: 'Traceable actions', text: 'Keep decisions and workflow activity auditable, with authorized people responsible for official outcomes.' },
]
const heroFeatures = [
  { icon: FileCheck2, title: 'Application workflow', text: 'Scrutiny, observations and resubmissions', tone: 'text-[#0D947F] bg-[#E8F6F1]', target: '#workflow' },
  { icon: CalendarDays, title: 'Compliance monitoring', text: 'Deadlines, undertakings and evidence', tone: 'text-[#F47716] bg-[#FFF0E2]', target: '#compliance' },
  { icon: Users, title: 'EVC management', text: 'Visits, assignments and reports', tone: 'text-[#2780C2] bg-[#EAF3FF]', target: '#workflow' },
  { icon: BellRing, title: 'Alerts & escalations', text: 'Pending actions and due dates', tone: 'text-[#D94841] bg-[#FFF0EF]', target: '#capabilities' },
]
const updateItems = [
  { icon: FileCheck2, label: 'Application Workflow', target: '#workflow', tone: 'text-[#F47716]' },
  { icon: CalendarDays, label: 'Compliance Monitoring', target: '#compliance', tone: 'text-[#168A78]' },
  { icon: Users, label: 'EVC Coordination', target: '#workflow', tone: 'text-[#2685C7]' },
  { icon: BellRing, label: 'Alerts & Escalations', target: '#capabilities', tone: 'text-[#D94841]' },
]
export default function Home() {
  const [loginOpen, setLoginOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  return <div className="min-h-screen bg-[#FDFBF7] text-[#17264F]">
    <Tricolour />
    {/* Slim utility row, inspired by the reference layout without unrelated portal branding. */}
    <div className="hidden border-b border-[#F0E8DC] bg-[#FFFCF7] px-5 py-2 text-xs text-[#344363] sm:block">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
        <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full bg-gradient-to-b from-[#F47716] via-white to-[#138808] ring-1 ring-slate-200" /> AICTE Nexus · Approval Workflow &amp; Compliance Portal</span>
        <div className="flex items-center gap-2"><a href="#support" className="inline-flex items-center gap-1.5 rounded-full border border-[#FFD1D1] bg-white px-3 py-1.5 font-bold text-[#C93636] hover:bg-red-50"><BellRing size={13} /> Important updates</a><a href="#support" className="inline-flex items-center gap-1.5 rounded-full border border-[#FFD1D1] bg-white px-3 py-1.5 font-bold text-[#C93636] hover:bg-red-50"><CircleHelp size={13} /> Help &amp; Support <ChevronDown size={12} /></a><span className="ml-3 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-bold text-[#17264F]">◎ EN</span></div>
      </div>
    </div>
    <header className="relative z-40 border-b border-slate-100 bg-white/95">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-5 px-5 py-3 sm:px-8">
        <Link to="/" aria-label="AICTE Nexus home" className="shrink-0"><Brand /></Link>
        <nav className="hidden items-center gap-7 text-sm font-bold text-[#17264F] lg:flex">
          <a className="border-b-2 border-[#F47716] py-2 text-[#F47716]" href="#overview">Home</a>
          <a className="transition hover:text-[#F47716]" href="#capabilities">Explore <ChevronDown size={13} className="ml-1 inline" /></a>
          <a className="transition hover:text-[#F47716]" href="#workflow">Approval Workflow <ChevronDown size={13} className="ml-1 inline" /></a>
          <a className="transition hover:text-[#F47716]" href="#compliance">Compliance</a>
        </nav>
        <div className="hidden items-center gap-3 sm:flex">
          <a href="#capabilities" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-[#17264F] transition hover:border-[#F47716] hover:bg-orange-50"><Landmark size={16} className="text-[#F47716]" /> Explore portal</a>
          <div className="relative">
            <button onClick={() => setLoginOpen(v => !v)} aria-expanded={loginOpen} className="inline-flex items-center gap-2 rounded-full border border-[#F7D9B9] bg-[#FFF5E8] px-6 py-3 text-sm font-extrabold text-[#17264F] shadow-sm transition hover:bg-[#FFEBD3]">Login <ChevronDown size={16} className={`transition ${loginOpen ? 'rotate-180' : ''}`} /></button>
            {loginOpen && <><button aria-label="Close login menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setLoginOpen(false)} /><div className="absolute right-0 top-[calc(100%+10px)] z-50 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_55px_-20px_rgba(23,38,79,.35)]">{Object.entries(ROLES).map(([key, name]) => { const Icon = roleIcons[key] || Landmark; return <Link key={key} to={`/login?role=${key}`} onClick={() => setLoginOpen(false)} className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-[#FFF1E4]"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FDF3E9] text-[#E86D12]"><Icon size={19} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#17264F]">{name}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{roleDescriptions[key]}</span></span><ArrowRight size={15} className="text-slate-400" /></Link> })}</div></>}
          </div>
        </div>
        <button className="rounded-xl border border-slate-200 p-2 sm:hidden" aria-label="Toggle menu" onClick={() => setMobileOpen(v => !v)}><Menu size={22} /></button>
      </div>
      {mobileOpen && <div className="border-t border-slate-100 bg-white p-4 sm:hidden"><div className="grid gap-1"><a href="#capabilities" onClick={() => setMobileOpen(false)} className="rounded-lg p-3 font-semibold hover:bg-slate-50">Explore</a><a href="#workflow" onClick={() => setMobileOpen(false)} className="rounded-lg p-3 font-semibold hover:bg-slate-50">Approval workflow</a><a href="#compliance" onClick={() => setMobileOpen(false)} className="rounded-lg p-3 font-semibold hover:bg-slate-50">Compliance</a><div className="my-1 border-t border-slate-100" />{Object.entries(ROLES).map(([key,name]) => <Link key={key} to={`/login?role=${key}`} className="rounded-lg p-3 font-semibold hover:bg-orange-50">Login · {name}</Link>)}</div></div>}
    </header>
    {/* Compact ticker row mirrors the reference's third navigation strip. */}
    <div className="relative z-20 border-b border-white/70 bg-gradient-to-r from-[#FFF0C9] via-[#F9F7F0] to-[#CFF0E1] px-4 py-2">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 overflow-x-auto whitespace-nowrap text-xs sm:text-sm">
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#FFD3A6] bg-white px-3 py-1 font-extrabold text-[#E9650B]"><span className="h-2 w-2 rounded-full bg-[#F47716]" /> WORKFLOW</span>
        <span className="shrink-0 font-bold text-[#17264F]">Platform capabilities <ArrowRight size={14} className="ml-1 inline" /></span>
        <span className="mx-1 h-5 w-px shrink-0 bg-slate-300" />
        {updateItems.map(({icon:Icon,label,target,tone}) => <a key={label} href={target} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white bg-white/90 px-3 py-1.5 font-semibold text-[#17264F] hover:border-[#F47716]"><Icon size={15} className={tone} /> {label}</a>)}
        <a href="#capabilities" className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full border border-[#FFD3A6] bg-white px-3 py-1.5 font-bold text-[#E9650B]">Explore all capabilities <ChevronDown size={13} /></a>
      </div>
    </div>
    <main>
      <section id="overview" className="nexus-hero relative isolate flex min-h-[650px] items-start justify-center overflow-visible sm:min-h-[680px] lg:min-h-[660px]">
        <div className="absolute inset-0 -z-20 bg-[#FDFBF7]" />
        <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: "url('/nexus-hero.png')" }} />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(255,247,233,.08),rgba(255,255,255,.16)_28%,rgba(255,255,255,.30)_50%,rgba(255,255,255,.12)_72%,rgba(236,250,240,.06))]" />
        <div className="mx-auto flex w-full max-w-[1600px] flex-col items-center px-5 pb-28 pt-10 text-center sm:px-8 sm:pt-12 lg:pt-[42px]">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-4 py-2 text-xs font-extrabold text-[#0D806F] shadow-sm backdrop-blur-sm"><span className="h-2 w-2 rounded-full bg-[#0D947F]" /> APPROVAL WORKFLOW <span className="mx-1 text-slate-300">|</span> COMPLIANCE MONITORING</div>
          <h1 className="max-w-6xl text-4xl font-black leading-[1.04] tracking-[-.04em] text-[#111B32] sm:text-5xl md:text-6xl lg:text-[3.65rem]">Streamlined Approvals.<br /><span className="text-[#F0640A]">Stronger Higher Education.</span></h1>
          <p className="mt-5 max-w-3xl text-base font-semibold leading-7 text-[#25324A] sm:text-lg">A unified workspace for AICTE approval workflows, institutional compliance, pendency monitoring and alert management.</p>
          <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-[#35435A] sm:text-base">Track application stages, coordinate scrutiny and EVC activities, monitor compliance milestones, and keep administrative follow-ups visible in one workspace.</p>
          <div className="mt-7 inline-flex rounded-[20px] border-[3px] border-[#17264F] bg-[#17264F] p-1.5 shadow-[0_15px_35px_-18px_rgba(23,38,79,.65)]">
            <a href="#workflow" className="inline-flex items-center gap-2 rounded-[15px] bg-[#F47716] px-5 py-3.5 text-sm font-extrabold text-white transition hover:bg-[#E9650B] sm:px-7"><FileCheck2 size={18} /> Explore Workflows</a>
            <Link to="/login" className="inline-flex items-center gap-2 rounded-[15px] px-5 py-3.5 text-sm font-extrabold text-white transition hover:bg-white/10 sm:px-7"><ChartNoAxesCombined size={18} /> Access Workspace</Link>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-semibold text-[#344363] sm:text-sm"><span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} className="text-[#0D947F]" /> Role-based access</span><span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} className="text-[#0D947F]" /> Deadline visibility</span><span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} className="text-[#0D947F]" /> Traceable actions</span></div>
        </div>
        <div className="absolute inset-x-4 bottom-[-52px] z-10 mx-auto max-w-[1320px] sm:inset-x-8">
          <div className="grid grid-cols-1 gap-1 rounded-[24px] border border-slate-200/90 bg-white/95 p-3 shadow-[0_22px_55px_-30px_rgba(23,38,79,.38)] backdrop-blur-md sm:grid-cols-2 lg:grid-cols-4 lg:p-4">
            {heroFeatures.map(({icon:Icon,title,text,tone,target},i) => <a key={title} href={target} className="group flex min-h-[88px] items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-[#FDFBF7] sm:px-4"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone}`}><Icon size={23} /></span><span className="min-w-0 flex-1 text-left"><span className="block text-sm font-extrabold text-[#17264F]">{title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{text}</span></span>{i===3 && <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F47716] text-white lg:flex"><ArrowRight size={18}/></span>}</a>)}
          </div>
        </div>
      </section>
      <div className="h-16 sm:h-20" />
      <section id="capabilities" className="bg-white py-16 sm:py-20"><div className="mx-auto max-w-7xl px-5 sm:px-8"><div className="max-w-2xl"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#0D947F]">Built around the process</p><h2 className="mt-3 text-3xl font-black tracking-tight text-[#17264F] sm:text-4xl">One view of every critical step.</h2><p className="mt-4 leading-7 text-slate-600">Bring application movement, compliance work and time-sensitive follow-ups into a structured administrative workflow.</p></div><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{capabilities.map(({icon:Icon,title,text},i) => <article id={title === 'Compliance monitoring' ? 'compliance' : undefined} key={title} className="group rounded-2xl border border-slate-200/80 bg-[#FDFBF7] p-6 transition hover:-translate-y-1 hover:border-[#F47716]/40 hover:bg-white hover:shadow-xl hover:shadow-slate-200/50"><div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${i%2===0?'bg-[#FFF0E2] text-[#E86D12]':'bg-[#E5F6F0] text-[#0D8B78]'}`}><Icon size={22} /></div><h3 className="mt-5 text-lg font-extrabold text-[#17264F]">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>)}</div></div></section>
      <section id="workflow" className="bg-gradient-to-r from-[#17264F] to-[#243967] py-16 text-white sm:py-20"><div className="mx-auto max-w-7xl px-5 sm:px-8"><div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#FFB36C]">A structured journey</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">From submission to accountable action.</h2><p className="mt-4 leading-7 text-blue-100/80">Make the current stage clear, direct work to the appropriate role, and keep follow-ups visible through the process.</p><Link to="/login" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#F47716] px-5 py-3.5 font-bold text-white transition hover:bg-[#E9650B]">Access workspace <ArrowRight size={17} /></Link></div><div className="grid gap-3 sm:grid-cols-2">{[{n:'01',t:'Submit & register',d:'Capture an application and its current status.'},{n:'02',t:'Scrutinise & respond',d:'Record observations and manage resubmissions.'},{n:'03',t:'Coordinate & monitor',d:'Track EVC, compliance and due dates.'},{n:'04',t:'Review & record',d:'Keep authorized decisions and actions traceable.'}].map(s=><div key={s.n} className="rounded-2xl border border-white/15 bg-white/[.06] p-5"><div className="text-sm font-black text-[#FFB36C]">{s.n}</div><h3 className="mt-3 font-extrabold">{s.t}</h3><p className="mt-2 text-sm leading-6 text-blue-100/75">{s.d}</p></div>)}</div></div></div></section>
    </main>
    <footer id="support" className="bg-[#0D1832] px-5 py-7 text-xs leading-6 text-blue-100/75 sm:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-base font-extrabold text-white">AICTE Nexus</p><p>Approval Workflow Automation · Compliance Monitoring · Alert Management</p></div><a href="#overview" className="font-semibold text-white hover:text-[#FFB36C]">Back to top ↑</a></div></footer>
  </div>
}
