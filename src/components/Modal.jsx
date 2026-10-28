export default function Modal({ title, children, onCancel, onConfirm, confirmLabel = 'Confirm', busy }) {
  return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
    <h3 className="mb-3 text-base font-semibold text-slate-800">{title}</h3>{children}
    <div className="mt-4 flex justify-end gap-2"><button onClick={onCancel} className="rounded border px-3 py-1.5 text-sm">Cancel</button>
      <button onClick={onConfirm} disabled={busy} className="rounded bg-blue-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">{busy ? 'Working...' : confirmLabel}</button></div></div></div>)
}
