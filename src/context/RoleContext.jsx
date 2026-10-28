import { useAuth } from './AuthContext'
// `role` is what existing pages use. It is the database-derived role, except in development where a preview role may be applied
// to the in-memory demo pages only. `realRole` is always the database role.
export function useRole() {
  const a = useAuth()
  return { role: a.previewRole || a.role, realRole: a.role, setRole: a.setPreviewRole }
}
