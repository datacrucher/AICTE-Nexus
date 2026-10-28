// Rule-based administrative hints. Never a statutory decision.
export function followUps(a) {
  if (['APPROVED', 'REJECTED'].includes(a.stage)) return ['Monitor post-decision compliance undertakings']
  const out = []
  if (a.openObservations) out.push(`Follow up on ${a.openObservations} open observation(s)`)
  if (a.leaseDays < 30) out.push('Verify lease renewal documentation')
  if (a.slaStatus === 'OVERDUE') out.push('Case is past demo SLA: consider escalation')
  else if (a.remaining <= 2) out.push(`Complete current stage within ${Math.max(a.remaining, 0)} day(s)`)
  return out.length ? out : ['No administrative follow-up flagged']
}
