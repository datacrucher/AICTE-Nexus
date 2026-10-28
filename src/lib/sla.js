import { STAGE_SLA_DAYS, TERMINAL, AT_RISK_DAYS } from '../config/workflow'
export function slaFor(stage, daysInStage, cfg = {}) {
  if (TERMINAL.includes(stage)) return { sla: 0, remaining: null, status: 'DONE' }
  const sla = (cfg.slaDays || STAGE_SLA_DAYS)[stage] ?? 0
  const remaining = sla - daysInStage
  const status = remaining < 0 ? 'OVERDUE' : remaining <= (cfg.atRisk ?? AT_RISK_DAYS) ? 'AT_RISK' : 'ON_TRACK'
  return { sla, remaining, status }
}
export const docStatus = (days, warn = 30) => days < 0 ? 'EXPIRED' : days <= warn ? 'EXPIRING_SOON' : 'VALID'
