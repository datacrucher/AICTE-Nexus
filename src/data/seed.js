import { slaFor } from '../lib/sla'
import { scoreRisk } from '../lib/risk'
import { escalationLevel } from '../lib/escalation'
import { fmtDate } from '../lib/dates'
export const INSTITUTIONS = ['Sri Venkateswara Institute of Technology','Narayana College of Engineering','Deccan School of Management','Lakeview Institute of Pharmacy','Greenfield Polytechnic','Arunodaya Institute of Technology','Coastal School of Architecture','Himalaya College of Engineering','Metro Institute of Computer Applications','Sapphire Institute of Technology']
export const REGIONS = ['Southern','Western','Eastern','Northern','Central']
export const OFFICERS = ['A. Rao','P. Sharma','M. Iyer','S. Khan','R. Das','K. Nair','V. Singh','L. Reddy']
const TYPES = ['New Institution','Extension of Approval','Intake Increase','New Course']
const STG = ['SCRUTINY','SCRUTINY','SUBMITTED','RESUBMISSION_REQUIRED','EVC_REQUIRED','EVC_SCHEDULED','COMMITTEE_REVIEW','APPROVED','FINAL_REVIEW','SCRUTINY']
export function buildApplications() {
  return Array.from({ length: 30 }, (_, i) => {
    const stage = STG[(i * 3 + (i % 4)) % 10], daysInStage = (i * 7) % 16 + 1
    const s = slaFor(stage, daysInStage), done = stage === 'APPROVED'
    const leaseDays = (i * 13) % 60 - 8
    const openObservations = ['SCRUTINY','RESUBMISSION_REQUIRED'].includes(stage) ? i % 3 : 0
    const complianceDays = done ? (i * 11) % 50 - 12 : null
    const risk = scoreRisk({ slaStatus: s.status, remaining: s.remaining, leaseDays, openObservations, complianceDays })
    const overdue = s.status === 'OVERDUE' ? -s.remaining : 0
    return { id:`AICTE-2026-${1001 + i * 7}`, institution:INSTITUTIONS[i % 10], region:REGIONS[i % 5], type:TYPES[i % 4], stage, daysInStage,
      sla:s.sla, remaining:s.remaining, slaStatus:s.status, officer:OFFICERS[i % 8], leaseDays, openObservations, complianceDays,
      risk:risk.level, riskScore:risk.score, riskReasons:risk.reasons, escalationLevel:escalationLevel(overdue),
      priority: i % 5 === 0 ? 'High' : 'Normal', daysPending: daysInStage + 20 + i, submittedOn: fmtDate(-(daysInStage + 20 + i)) }
  })
}
