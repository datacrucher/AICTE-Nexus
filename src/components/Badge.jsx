const C = { ON_TRACK:'emerald', LOW:'emerald', DONE:'slate', AT_RISK:'amber', MEDIUM:'amber', HIGH:'orange', OVERDUE:'red', CRITICAL:'red', INFO:'blue' }
const CLS = { emerald:'bg-emerald-50 text-emerald-700 border-emerald-200', slate:'bg-slate-100 text-slate-600 border-slate-200', amber:'bg-amber-50 text-amber-700 border-amber-200', orange:'bg-orange-50 text-orange-700 border-orange-200', red:'bg-red-50 text-red-700 border-red-200', blue:'bg-blue-50 text-blue-700 border-blue-200' }
export default function Badge({ value, label }) {
  return <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${CLS[C[value] || 'blue']}`}>{label || value.replace(/_/g, ' ')}</span>
}
