# Demo checklist (fresh `seed-demo` database; numbers below are for the untouched seed)

Prepare: backend running, frontend open, demo password from `seed-demo`. Use two browser profiles (or private windows) so two roles can be signed in. State-changing steps (3, 6, 7) alter data; to repeat the demo run `python -m app.cli seed-demo --force`.

1. **Admin login** `admin-0@nexus-demo.invalid`. Header shows the name and role.
2. **Dashboard.** Total 30, pending 30, overdue 17, open escalations 17, overdue compliance 3, upcoming EVC visit 1, critical alerts 29 (the red badge on Alerts matches). Point out the stage and region charts, risk distribution, action queue and recent activity.
3. **Applications.** Search `1001`; filter Region = Southern (6 results) and SLA = OVERDUE (17). Open `AICTE-2026-1015` (overdue, escalation level 3, HIGH risk): show Overview, Documents, Timeline, Audit Trail and the risk explanation.
4. **Alerts.** Severity filter; each card shows the rule that produced it and links to the application. Say clearly: alerts are evaluated live, not stored.
5. **Escalations (admin).** Show the list and level. Say that escalation rows are seeded (no scheduled job yet).
6. **Escalation acknowledgement.** Sign in as `regional-0` (second window): Escalations shows only Southern cases; Acknowledge one (remarks optional). Try Resolve: not offered (admin only). Back as admin: Resolve with remarks (remarks required). Dashboard open escalations drops by one; the history list shows both actions.
7. **Workflow action.** Sign in as `scrutiny-3`; open `AICTE-2026-1022` (SUBMITTED); Start scrutiny; add a remark. Show the new timeline and audit entries.
8. **Restricted access.** Sign in as `institution-0`: only 3 applications; no Escalations link; opening `/escalations` shows a restricted message; opening `/applications/AICTE-2026-1015` shows "not found or not visible" (another institution's record); officer names and staff remarks are hidden.
9. **Simulated modules.** Open Compliance, EVC and Audit Logs (tagged "demo"). State plainly: these pages use in-memory demo data that resets on refresh; the backend has the tables but no endpoints for them yet.


## End-to-end live workflow (updated demo build)

Use a fresh local demo database only if you intentionally want to reset the sample data. Do not use `seed-demo --force` on a database with data you need.

1. From `backend`, activate `.venv`, install requirements if needed, then run `python -m app.cli init-db` so any new workflow actions are registered. Existing seeded users are preserved by `init-db`.
2. Sign in using the one-click demo access as **Institution**.
3. Open **Applications** and choose **Submit new application**. Select a type and submit. This creates a persistent database application in `SUBMITTED`, assigns the first active scrutiny account, writes stage history and an audit event, and opens its details page.
4. Sign in as the assigned Scrutiny Officer (`scrutiny-0@nexus-demo.invalid` for newly created applications in the seeded demo). Open the new application, click **Start scrutiny**, then **Raise observation** with a specific note.
5. Sign back in as the matching Institution account, open the application, and click **Submit response to observations** with a response note.
6. Sign in as the assigned Scrutiny Officer again and click **Mark scrutiny complete**. This requires open observations to be responded to. The backend creates a demo EVC visit and assigns an EVC member for the next stage.
7. Sign in as the EVC member (`evc-0@nexus-demo.invalid` for newly created demo applications), open the application and click **Record EVC visit scheduled**, then **Complete EVC visit and submit report**.
8. Sign in as the Regional Officer for the institution's region (institution-0 belongs to Southern; use `regional-0@nexus-demo.invalid`) and click **Forward to final review**.
9. Sign in as Super Admin (`admin-0@nexus-demo.invalid`) and click **Record approval decision**. The application should show `APPROVED`, with stage history and audit trail updated.
10. Open Dashboard, Alerts and Audit Trail to show the effects. Application, stage history and audit events are stored in SQLite. Compliance and EVC management pages still have separate in-browser demo interactions unless explicitly connected to their backend APIs; label those honestly in the presentation.

All names, records, dates, and actions here are fictional demonstration data. This is a workflow simulation, not an official AICTE decision process.
