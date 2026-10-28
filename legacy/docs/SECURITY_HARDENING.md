# Migration 6 (security hardening) and migration 7 (dashboard views)

All findings below were reproduced against the local PostgreSQL test database before the fix and are covered by regression tests (`supabase/tests/20_hardening_tests.sql`, `tests/applications.int.test.js`). **Not verified on a live Supabase project.**

| Finding | Fix (migration 6) |
|---|---|
| Regional/admin could set compliance `state` to VERIFIED directly | Column-level UPDATE grant: only `title, description, due_at, verifier_id` are client-writable. `state` changes only via `submit_evidence` / `review_evidence`. |
| Scrutiny/regional could edit document expiry and file fields | Only `verification_status` is client-updatable on `documents`. |
| Documents/evidence could point at another institution's storage path | CHECK constraint on `documents.storage_path`, trigger on `evidence_submissions`, and a stricter storage upload policy (exactly `<institution_id>/<application_id>/<file>`, no `..`). |
| Staff could read all institution profiles | `profiles` readable only by its owner (and admins). Staff names come from `staff_directory` (id, full_name, role of active staff, staff roles only). |
| Institutions read staff-written audit/timeline remarks | Institutions can no longer read `audit_events` / `application_stage_history`. They use `audit_trail` / `stage_timeline`, which mask staff remarks and identities and hide escalation activity. Staff see everything for applications they may access. |

Decision for you: institutions now see *that* a stage changed and who the actor's role was, but not staff remarks. Observation text and evidence-review remarks stay visible to the institution through their own tables. Change the views if you want different exposure.

Notes
- `staff_directory`, `audit_trail`, `stage_timeline` are intentionally NOT `security_invoker` (they must mask columns). Supabase's Security Advisor may flag security-definer views; each has an explicit role filter.
- Edits to non-state compliance fields (e.g. due date) are allowed for admin/regional but are not audited, because the generic audit trigger watches only status columns.
- Migration 7 adds `dashboard_metrics`, `dashboard_stage_counts`, `dashboard_region_overdue` (all `security_invoker`, read-only). Critical alerts there mirror the CRITICAL rules of the in-memory Alerts page and must be reconciled when Alerts is migrated.
