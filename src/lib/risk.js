import { RISK_WEIGHTS as W, RISK_LEVELS } from '../config/workflow'
export function scoreRisk({ slaStatus, remaining, leaseDays, openObservations, complianceDays }) {
  let score = 0; const reasons = []
  if (slaStatus === 'OVERDUE') { score += W.overdue; reasons.push(`Stage SLA exceeded by ${-remaining} days`) }
  else if (slaStatus === 'AT_RISK') { score += W.atRisk; reasons.push(`Only ${remaining} day(s) left in stage SLA`) }
  if (leaseDays < 0) { score += W.leaseExpired; reasons.push(`Lease agreement expired ${-leaseDays} days ago`) }
  else if (leaseDays < 30) { score += W.leaseExpiring; reasons.push(`Lease agreement expires in ${leaseDays} days`) }
  if (openObservations) { score += W.perObservation * openObservations; reasons.push(`${openObservations} unresolved observation(s)`) }
  if (complianceDays != null && complianceDays < 0) { score += W.complianceOverdue; reasons.push(`Compliance undertaking overdue by ${-complianceDays} days`) }
  const level = RISK_LEVELS.find(([max]) => score < max)[1]
  return { score, level, reasons }
}
