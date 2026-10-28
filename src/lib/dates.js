const DAY = 864e5
export const fmtDate = (offsetDays, base = new Date()) => new Date(+base + offsetDays * DAY).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
