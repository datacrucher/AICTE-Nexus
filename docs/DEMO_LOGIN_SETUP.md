# Local one-click demo login

The login page includes one-click demo buttons for Super Admin, Regional Officer,
Scrutiny Officer, Institution, and EVC Committee. The API endpoint is disabled
when `NEXUS_ENV=production`; it only issues a token for a pre-seeded fictional
`@nexus-demo.invalid` account. It does not create users on demand.

## Initialize a new local database

Open PowerShell in the `backend` folder and activate the existing virtual
environment. Then run:

```powershell
python -m app.cli init-db
python -m app.cli seed-demo
```

`seed-demo` prints a generated demo password, but the one-click buttons do not
require you to enter it. Do not use `seed-demo --force` on a database with data:
that option drops and recreates all tables.

If `seed-demo` reports that users already exist, stop and inspect the current
database before doing anything destructive. The demo buttons require these
seeded accounts to exist:

- `admin-0@nexus-demo.invalid`
- `regional-0@nexus-demo.invalid`
- `scrutiny-0@nexus-demo.invalid`
- `institution-0@nexus-demo.invalid`
- `evc-0@nexus-demo.invalid`

## Start the backend

From the `backend` folder:

```powershell
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --port 8000
```

Keep the frontend running in a separate terminal using `npm run dev`.
