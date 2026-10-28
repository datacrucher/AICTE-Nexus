// Local-test only: mints HS256 JWTs the way Supabase Auth would, for the PostgREST instance started by run_local.py.
import { createHash, createHmac } from 'node:crypto'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
export const mint = (secret, claims) => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, ...claims }); return `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}` }
export const uid = (seed) => { const x = createHash('md5').update(seed).digest('hex'); return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}` }
