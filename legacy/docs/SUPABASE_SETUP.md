# AICTE Nexus: Supabase database foundation

Status: schema, security and fictional seed data, plus Supabase Auth and the Applications module in the frontend. See `docs/PHASE2_AUTH_AND_APPLICATIONS.md` for step-by-step setup and the exact verified/unverified list. The other modules still use the in-memory mock service.
This is a hackathon prototype. Everything is fictional demo data, nothing connects to any AICTE system, and all SLA/risk/escalation values are **DEMO** configuration.

## 1. Requirements
- A Supabase project on **PostgreSQL 15 or newer** (the SLA view uses `security_invoker`).
- Supabase CLI (`npm i -g supabase`) or access to the dashboard SQL editor.

## 2. Files
| File | Purpose |
|---|---|
| `supabase/migrations/20261024000001_core_schema.sql` | Tables, constraints, indexes, DEMO config (stages, SLA days, actions, settings), SLA view |
| `..._000002_security_rls.sql` | Helper functions, privilege revokes/grants, RLS policies, profile guards |
| `..._000003_audit_and_workflow.sql` | Audit/history triggers, append-only audit, atomic business functions (RPCs) |
| `..._000004_storage.sql` | Private `nexus-documents` bucket and storage policies (Supabase only) |
| `..._000006_security_hardening.sql` | Column-level grants, storage-path validation, least-privilege profile/audit views (see `docs/SECURITY_HARDENING.md`) |
| `..._000007_dashboard_views.sql` | Read-only dashboard aggregate views (RLS-scoped) |
| `..._000005_application_overview.sql` | Read-only `application_overview` view: server-side SLA, risk score and escalation level for the Applications module |
| `supabase/seed.sql` | Fictional data mirroring the frontend mock data (30 users, 10 institutions, 30 applications, ...) |
| `supabase/tests/*` | Local-only validation harness (see section 7). **Never run the stubs on a real project.** |

## 3. Apply to your project
**CLI (recommended)**
```
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase db push            # applies the seven migrations in order
```
**Dashboard instead:** SQL Editor, run the seven migration files in filename order.

**Seed (demo/dev projects only):** paste `supabase/seed.sql` into the SQL Editor and run it once. Re-running fails on duplicates; use a fresh project or truncate first. Do not seed a production project.

## 4. Accounts and roles
- The seed creates 30 demo auth users (`<role>-<n>@nexus-demo.invalid`) with **no password**. Set a password per account in *Authentication > Users*, or send a reset link, to log in as them.
- Roles: `admin`, `regional`, `scrutiny`, `institution`, `evc`. A signed-up user with no `profiles` row can read nothing.
- **First real admin:** create the user in Authentication, then in the SQL editor (service role): `insert into public.profiles (id, full_name, role) values ('<user-uuid>', 'Name', 'admin');`
- Only admins can create profiles or change `role`, `institution_id`, `region_code` or `is_active`. Everyone else can edit only their own `full_name`. Enforced by RLS and by a trigger.

## 5. Environment variables
Frontend (`.env.local` locally, Vercel project settings in deployment). See `.env.example`.
| Variable | Value | Exposed to browser |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL | yes, public |
| `VITE_SUPABASE_ANON_KEY` | anon/public key | yes, public by design; safety comes from RLS |

**Never** put the `service_role` key, database password or JWT secret in the frontend, in any `VITE_*` variable, or in git. The service role bypasses RLS. Use it only in your own terminal or server-side secrets.

## 6. Security model (summary)
- **Deny by default:** all tables have RLS; `anon` has no table access; `authenticated` has only the grants listed in migration 2.
- **Visibility** (`app_visible`): admin all; regional their region; scrutiny applications assigned to them; institution their own institution; EVC member applications where they are assigned to a visit. Child tables reuse this, so institutions never see each other's records.
- **Writes** to workflow, evidence and escalations go only through `transition_application`, `submit_evidence`, `review_evidence`, `act_on_escalation` (security definer, role- and stage-checked, atomic with history and audit rows). Direct updates to `applications`, `evidence_submissions`, `evc_*`, `observations`, `escalations`, `audit_events` are not granted to clients.
- **Audit:** `audit_events` has no client write path, rejects UPDATE/DELETE/TRUNCATE by trigger, and timestamps come from the database. **This is not tamper-proof against the database owner or a superuser.** Hash chaining or external log shipping is future work.
- **Storage:** private bucket, 5 MB limit, PDF/PNG/JPEG only, no client update or delete. Path convention `<institution_id>/<application_id>/<file>`.
- Statutory decisions remain human actions: `approve`/`reject` only record a decision made by an admin (competent authority); no automated approval exists.

## 7. What was validated, and what was not
See `docs/PHASE2_AUTH_AND_APPLICATIONS.md` (section "What is verified, and what is not"). Short version: verified on local PostgreSQL 16 with real roles and a real PostgREST (82 SQL checks, 10 HTTP integration tests); **not** verified on a live Supabase project, including Supabase Auth and storage.

## 8. Not done yet (next phases)
- EVC write functions (schedule, reschedule, cancel, complete, report submit/review): tables are read-only to clients until these exist.
- Document upload/verification flow, observation closing, compliance creation functions, notification generation, scheduled SLA/escalation jobs, server-side risk scoring.
- Replacing the mock service functions with Supabase queries and adding Supabase Auth to the login screen.
- Configuration for official AICTE timelines: set `config_status = 'VERIFIED'` only after the rules are confirmed.
