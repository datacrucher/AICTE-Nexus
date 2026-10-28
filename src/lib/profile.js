// The role is whatever the backend returns for the authenticated user (/auth/me). Nothing from the browser decides it.
export const ROLE_NAMES = ['admin', 'regional', 'scrutiny', 'institution', 'evc']
export function accessFromProfile(profile) {
  if (!profile) return { ok: false, reason: 'NO_PROFILE' }
  if (!profile.is_active) return { ok: false, reason: 'INACTIVE' }
  if (!ROLE_NAMES.includes(profile.role)) return { ok: false, reason: 'UNKNOWN_ROLE' }
  return { ok: true, role: profile.role }
}
