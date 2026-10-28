// DEMO values only. Replace once official AICTE timelines are verified.
export const STAGES = ['SUBMITTED','SCRUTINY','RESUBMISSION_REQUIRED','EVC_REQUIRED','EVC_SCHEDULED','COMMITTEE_REVIEW','FINAL_REVIEW','APPROVED']
export const TERMINAL = ['APPROVED','REJECTED']
export const STAGE_SLA_DAYS = { SUBMITTED:3, SCRUTINY:10, RESUBMISSION_REQUIRED:7, EVC_REQUIRED:5, EVC_SCHEDULED:14, COMMITTEE_REVIEW:10, FINAL_REVIEW:7 }
export const AT_RISK_DAYS = 2
export const RISK_WEIGHTS = { overdue:40, atRisk:20, leaseExpired:25, leaseExpiring:10, perObservation:10, complianceOverdue:25 }
export const RISK_LEVELS = [[20,'LOW'],[40,'MEDIUM'],[65,'HIGH'],[Infinity,'CRITICAL']]
export const EXPIRY_WARN_DAYS = 30
export const ESCALATION_STEPS = [[10,4],[7,3],[4,2],[1,1]]
export const ESCALATION_LABELS = ['Normal','Officer alerted','Regional officer alerted','Bureau authority alerted','Competent authority alerted']
export const DOC_ALERT_STEPS = [[7, 'CRITICAL'], [15, 'WARNING'], [30, 'INFO']] // demo tiers: days to expiry -> severity
