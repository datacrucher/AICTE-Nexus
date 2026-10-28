export default function StatCard({ icon: Icon, label, value, hint, tone = 'text-blue-900' }) {
  return (<div className="rounded-md border border-slate-200 border-t-4 border-t-blue-800 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-xs text-slate-500">{label}{Icon && <Icon size={16} />}</div>
    <div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div><div className="mt-1 text-xs text-slate-400">{hint}</div></div>)
}
