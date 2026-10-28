# Phase 2A and 2B: Supabase authentication and the first persistent module (Applications)

Everything here uses fictional demo data. SLA, risk and escalation values are DEMO configuration, not official AICTE rules. Nothing connects to any AICTE system.

## What changed in the app
- **Auth:** email/password sign-in with Supabase Auth, session restoration on reload, sign-out, and protected routes (`RequireAuth`).
- **Role:** loaded from the signed-in user's row in `public.profiles` and nowhere else. No role is read from local storage, the URL, or JWT metadata. A user with no profile, an inactive profile, or an unknown role gets a "No access" screen.
- **Demo role switching is gone.** A preview selector exists only when running `npm run dev` (Vite sets `import.meta.env.DEV` to false in production builds). It changes only which role the in-memory demo pages pretend to be. It never touches the Supabase session, so it cannot grant database access. The Applications module always uses your real account.
- **Key safety:** the app refuses to start if `VITE_SUPABASE_ANON_KEY` looks like a service-role/secret key.
- **Applications module on Supabase:** list (server-side search, filters, pagination), detail, observations, documents, stage timeline, audit trail, and stage transitions through the database function `transition_application`. Which actions a user sees comes from the `workflow_actions` table. SLA, risk score, reasons and escalation level come from the new `application_overview` view (migration 5), so the browser holds no business rules for them.
- **Dashboard** now reads Supabase views (migration 7). **Not migrated yet (still in-memory demo data):** Alerts, Escalations, Compliance, EVC, Audit Logs and their navigation badge. They keep working but reset on refresh and do not reflect database changes.

## Compatibility findings (frontend vs schema)
- Role names and workflow stage names are identical. The database adds `DRAFT`; the UI never needs it.
- URLs use the application **reference** (`AICTE-2026-1001`); the database primary key is a UUID kept as `dbId`.
- Regions: UI shows names (`Southern`), the database stores codes (`SOUTHERN`); the view returns both.
- Institution users cannot read staff profiles (by design), so officer names show as "Assigned officer" for them and timeline actors may show a generic label.
- The in-memory pages still link to `/applications/AICTE-2026-xxxx`; the seed uses the same references, so those links work.

## Setup, step by step
1. **Create a project** at https://supabase.com (PostgreSQL 15+). In *Project Settings > API* copy the **Project URL** and the **anon / publishable key**. Do not copy the `service_role` / secret key anywhere in this repo.
2. **Apply the migrations** (seven files, in order):
   - CLI: `supabase login`, `supabase link --project-ref <ref>`, `supabase db push`.
   - or paste each file from `supabase/migrations/` into the SQL Editor in filename order.
3. **Seed demo data (dev project only):** run `supabase/seed.sql` once in the SQL Editor.
4. **Create the first admin:** *Authentication > Users > Add user* with an email and a strong password (tick auto-confirm). Copy the new user's UUID, then in the SQL Editor:
   `insert into public.profiles (id, full_name, role) values ('<uuid>', 'Your Name', 'admin');`
5. **Log in as seeded accounts (optional):** seeded users have no password. In the SQL Editor set one you choose, for example
   `update auth.users set encrypted_password = extensions.crypt('<your-strong-password>', extensions.gen_salt('bf')) where email = 'scrutiny-3@nexus-demo.invalid';`
   Seeded emails look like `admin-0@`, `regional-0@`, `scrutiny-3@`, `institution-0@`, `evc-0@` followed by `nexus-demo.invalid`. Never commit passwords.
6. **Recommended auth settings:** disable public sign-ups (*Authentication > Providers > Email*). A signed-up user without a profile can read nothing, but there is no reason to allow it.
7. **Configure the app:** `cp .env.example .env.local`, then set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. On Vercel, add the same two variables in Project Settings > Environment Variables.
8. **Run:** `npm install`, `npm run dev`, open the printed address, sign in.
9. **Check security:** run Supabase's Security Advisor, and try the app as an institution account: it must only list that institution's applications.

## Tests
| Command | What it proves | Needs |
|---|---|---|
| `npm test` | 11 unit tests: role derived only from the database profile, no-profile/inactive/unknown denied, service-role key refused, API query building, search sanitising, error handling | Node 20+ |
| `python3 supabase/tests/run_local.py` | SQL: all five migrations, seed, 154 SQL checks on PostgreSQL 16. Then a fresh database behind a real PostgREST: 10 integration tests drive the real application code and supabase-js as different roles (RLS, bypass attempts, transitions, timeline and audit), plus a parity check against the old frontend engine for all 30 applications | `pip install pgserver`, PostgREST binary at `/tmp/postgrest` (or `POSTGREST_BIN`) |

## What is verified, and what is not
**Verified locally (PostgreSQL 16.2 + PostgREST 12.2.3, JWTs minted by the test harness):** migrations and seed apply; 154 SQL checks pass; 26 JS tests pass (13 unit, 13 integration/parity); `npm run build` succeeds.
**Not verified:** anything on a live Supabase project. In particular Supabase Auth itself (sign-in, session refresh, token expiry, sign-out), the hosted API gateway, the real `auth.uid()` implementation and Supabase's default grants, the storage bucket and policies, PostgreSQL 15/17 behaviour, and any browser/UI testing. The login screen and route protection were checked by build and unit tests only, not by clicking through them.

## Remaining work
- Migrate Dashboard (counts via a server-side view), Alerts, Escalations, Compliance, EVC and Audit Logs, and the nav badge; add the missing EVC write functions and compliance/notification generation.
- Document upload and verification through the private storage bucket.
- Observation closing, an admin screen for profiles and role assignment, password reset and account recovery flows.
- Live Supabase verification of all of the above, plus UI tests in a browser.


## Integration status (final checkpoint)
| Module | Data | Notes |
|---|---|---|
| Login, session, role | Supabase | role from `profiles`, never from the browser |
| Dashboard | **Real** | `dashboard_metrics`, `dashboard_stage_counts`, `dashboard_region_overdue`, `application_overview`, `audit_trail` (all RLS-scoped). Includes risk distribution and recent activity. |
| Applications + detail | **Real** | reads and `transition_application` |
| Alerts | **Real data, evaluated in the browser** | there is no alerts table; alerts are computed from real RLS-scoped rows with demo rules (`lib/alerts.js`). Not stored/acknowledged/emailed. Critical count equals the dashboard card and nav badge (tested for all 5 roles). |
| Escalations | **Real** | `escalations` table and `act_on_escalation`. Rows come from the seed; nothing creates or re-levels them automatically yet. |
| Nav alert badge | **Real** | `dashboard_metrics.critical_alerts` |
| Compliance, EVC, Audit Logs | **Simulated** (in-memory, resets on refresh) | tagged "demo" in the sidebar; not connected to the database |

## Run and deploy
- Local: `npm install`, `cp .env.example .env.local` (fill in URL + anon key), `npm run dev`.
- Checks: `npm run build`, `npm test`, and `python3 supabase/tests/run_local.py` (needs `pip install pgserver` and a PostgREST binary at `/tmp/postgrest`).
- Vercel: import the repo, framework Vite, build `npm run build`, output `dist`, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (never the service-role key). `vercel.json` already rewrites all paths to `index.html`.
- Supabase: apply all seven migrations in order, then `seed.sql` on a demo project, create the first admin, disable public sign-ups, and add your Vercel URL under Authentication > URL Configuration.
