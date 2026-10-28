import { ESCALATION_STEPS } from '../config/workflow'
export const escalationLevel = (overdueDays) => (ESCALATION_STEPS.find(([d]) => overdueDays >= d) || [0, 0])[1]
