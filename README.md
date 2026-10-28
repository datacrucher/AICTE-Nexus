# AICTE Nexus (SIH 2026, problem statement SIH26262)

Approval-workflow automation, SLA/risk monitoring and alerting prototype. **Fictional demo data; a hackathon prototype, not an official AICTE system.**

**Architecture:** React + Vite + Tailwind frontend, FastAPI backend, SQLAlchemy 2 ORM, Alembic migrations, PostgreSQL (SQLite allowed for local development).
The browser never talks to the database. Authentication is backend-managed (bcrypt-hashed passwords, signed tokens), and every endpoint enforces role-based visibility and permissions on the server.

## What is real and what is simulated
| Module | Status |
|---|---|
| Login, session, roles | **Live** (backend `/api/auth/*`; role always read from the database) |
| Dashboard | **Live** (metrics, stage/region/risk charts, action queue, recent activity) |
| Applications list and detail, workflow transitions | **Live** (search, filters, pagination, timeline, audit trail, permitted stage actions) |
| Alerts, nav alert badge | **Live data, rules evaluated by the backend** (no alerts table: not stored or acknowledged) |
| Escalations (list, acknowledge, resolve) | **Live** (escalation rows come from the seed; nothing creates or re-levels them automatically yet) |
| **Compliance, EVC, Audit Logs pages** | **Simulated.** In-memory demo data that resets on refresh. Tagged "demo" in the navigation. The backend has the tables and seed data for them but no endpoints yet. |
| Not built | officer assignment, application creation/submission UI, compliance/EVC write endpoints, document upload/storage, scheduled alert/escalation jobs |

## Run locally (fresh machine)
Prerequisites: Node 18+ (tested on 22), Python 3.11+ (tested on 3.12). PostgreSQL is optional locally.
```bash
# 1. Backend
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                      # then set SECRET_KEY (see the comment inside)
python -m app.cli init-db                                 # runs Alembic migrations + reference data
python -m app.cli seed-demo                               # fictional demo data; prints a random demo password ONCE
#   or, for an empty system with just an administrator:
#   python -m app.cli create-admin --email you@example.org --name "Your Name"      (password prompted, or ADMIN_PASSWORD)
uvicorn app.main:app --reload --port 8000

# 2. Frontend (second terminal, project root)
npm install
npm run dev                                               # http://localhost:5173 (Vite proxies /api to the backend)
```
Demo accounts (password = the one printed by `seed-demo`, or `DEMO_PASSWORD` if you set it): `admin-0`, `regional-0..4`, `scrutiny-0..7`, `evc-0..5`, `institution-0..9` @ `nexus-demo.invalid`.
`regional-0` is the Southern region; `institution-0` is Sri Venkateswara Institute of Technology. Re-seeding: `python -m app.cli seed-demo --force` (drops all tables; disabled when `NEXUS_ENV=production`).

## Tests
```bash
cd backend && python -m pytest -q          # 42 backend tests (auth, RBAC, applications, workflow, dashboard, alerts, escalations, CLI, migrations)
npm run build && npm test                  # frontend build + 14 unit tests (+5 end-to-end tests when NEXUS_TEST_API is set, see below)
```
End-to-end (real frontend service modules against a running backend on a freshly seeded database):
`DATABASE_URL=sqlite:////tmp/e2e.db DEMO_PASSWORD=<pw> python -m app.cli seed-demo --force`, start `uvicorn` on a port, then
`NEXUS_TEST_API=http://127.0.0.1:<port>/api NEXUS_TEST_PASSWORD=<pw> npm test`.
Backend tests also run on PostgreSQL: `TEST_DATABASE_URL=postgresql://user:pw@host/testdb python -m pytest -q` (use a throwaway database; tables are dropped and recreated).

## Deploy
**Backend** (any host that runs Python, e.g. Render, Railway, Fly.io) with a PostgreSQL database:
- Build: `pip install -r backend/requirements.txt`. Start (from `backend/`): `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Before first start and after each release: `python -m app.cli init-db`.
- Environment variables: `NEXUS_ENV=production`, `DATABASE_URL` (the host's Postgres URL; `postgres://` is accepted), `SECRET_KEY` (random, 32+ chars; the app refuses to start without it in production), `CORS_ORIGINS=https://<your-frontend-domain>`. See `backend/.env.example`.
- Create the first administrator on the server: `ADMIN_PASSWORD=... python -m app.cli create-admin --email ... --name ...`. Only run `seed-demo` on a demo deployment.
**Frontend** on Vercel (Vite preset, build `npm run build`, output `dist`; `vercel.json` already rewrites routes to `index.html`): set `VITE_API_BASE_URL=https://<backend-host>/api` and redeploy (Vite variables are baked in at build time).
Serve both over HTTPS. The backend must be reachable from the browser and list the frontend origin in `CORS_ORIGINS`.

## Security notes
Passwords: bcrypt. Tokens: signed JWT holding only the user id (8h default); the role is read from the database on every request, so a forged role claim has no effect (tested). Login throttling is per process and in-memory. Institutions never receive staff identities or staff-written remarks. Audit events are append-only in application code but are **not tamper-proof** against a database administrator. The token is kept in `sessionStorage`; there is no refresh-token or server-side revocation (deactivating a user does block them immediately). No credentials are stored in the repository; demo passwords are generated at seed time.
Earlier Supabase-based work is kept for reference in `legacy/` and is not used by the app.
