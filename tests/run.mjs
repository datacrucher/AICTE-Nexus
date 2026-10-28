// Bundles tests/*.test.js with esbuild (so extensionless src imports resolve) and runs them with node:test.
// Integration/parity tests skip themselves unless their env vars are present.
import { build } from 'esbuild'
import { readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const out = '.tmp-tests'
rmSync(out, { recursive: true, force: true })
const entries = readdirSync('tests').filter((f) => f.endsWith('.test.js')).map((f) => `tests/${f}`)
await build({ entryPoints: entries, bundle: true, platform: 'node', format: 'esm', outdir: out, define: { 'import.meta.env': '{}', 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.NEXUS_TEST_API || '') }, logLevel: 'error',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } })
const files = readdirSync(out).filter((f) => f.endsWith('.js')).map((f) => `${out}/${f}`)
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })
rmSync(out, { recursive: true, force: true })
process.exit(r.status ?? 1)
