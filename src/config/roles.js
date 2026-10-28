// DEMO roles only. Visibility/permissions here are UI conveniences, not security.
import { INSTITUTIONS } from '../data/seed'
export const ROLES = { admin:'Super Admin', regional:'Regional Officer', scrutiny:'Scrutiny Officer', institution:'Institution', evc:'EVC Committee' }
export const DEMO_INSTITUTION = INSTITUTIONS[0]
export const DEMO_REGIONS = ['Southern', 'Western']
export const visibleTo = (role, a) => ({
  admin: true,
  regional: DEMO_REGIONS.includes(a.region),
  scrutiny: ['SUBMITTED', 'SCRUTINY', 'RESUBMISSION_REQUIRED'].includes(a.stage),
  institution: a.institution === DEMO_INSTITUTION,
  evc: a.stage.startsWith('EVC'),
}[role])
// Workflow actions. Decisions are recorded by authorized humans; nothing here is automated.
export const ACTIONS = [
  { id:'start', label:'Start scrutiny', roles:['scrutiny'], from:'SUBMITTED', to:'SCRUTINY' },
  { id:'raise', label:'Raise observation', roles:['scrutiny'], from:'SCRUTINY', to:'RESUBMISSION_REQUIRED', note:'Sends the application back to the institution.' },
  { id:'complete', label:'Mark scrutiny complete', roles:['scrutiny'], from:'SCRUTINY', to:'EVC_REQUIRED', note:'Requires all observations to be closed.' },
  { id:'respond', label:'Submit response to observations', roles:['institution'], from:'RESUBMISSION_REQUIRED', to:'SCRUTINY' },
  { id:'forward', label:'Forward to final review', roles:['regional'], from:'COMMITTEE_REVIEW', to:'FINAL_REVIEW' },
  { id:'approve', label:'Record approval decision', roles:['admin'], from:'FINAL_REVIEW', to:'APPROVED', note:'Recording a decision made by the competent authority.' },
  { id:'reject', label:'Record rejection decision', roles:['admin'], from:'FINAL_REVIEW', to:'REJECTED', note:'Recording a decision made by the competent authority.' },
]
// Demo page access. UI convenience only, not security.
export const PAGE_ACCESS = { escalations: ['admin', 'regional', 'scrutiny'], compliance: ['admin', 'regional', 'institution'], evc: ['admin', 'regional', 'evc', 'institution'] }
export const canAccess = (role, page) => !PAGE_ACCESS[page] || PAGE_ACCESS[page].includes(role)
export const ESC_ACTIONS = { acknowledge: { label: 'Acknowledge', roles: ['admin', 'regional'] }, resolve: { label: 'Resolve', roles: ['admin'] } }
// Demo permissions, enforced in the service layer too. Not production security.
export const COMPLIANCE_PERMS = { submit: ['institution'], review: ['regional'] }
export const EVC_PERMS = { schedule: ['admin', 'regional'], complete: ['evc', 'admin'], report: ['evc'], review: ['regional', 'admin'] }
