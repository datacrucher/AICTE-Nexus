import { useEffect, useState } from 'react'
import { subscribe } from '../services/applications'
// Bumps whenever the in-memory service data changes, so pages re-fetch within the session.
export function useDataVersion() {
  const [v, setV] = useState(0)
  useEffect(() => subscribe(() => setV((x) => x + 1)), [])
  return v
}
