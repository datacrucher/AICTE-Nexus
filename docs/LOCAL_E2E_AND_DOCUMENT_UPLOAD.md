# Local end-to-end demo and document upload

This is a local hackathon prototype with fictional data, not an official AICTE service.

## Start the app on Windows

Open two VS Code terminals from the project root.

### Terminal 1 — backend
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
python -m app.cli init-db
python -m app.cli seed-demo
python -m uvicorn app.main:app --reload --port 8000
```

Run `seed-demo` only on a fresh demo database. If it says users already exist, that is expected; do not use `--force` unless you intentionally want to erase and recreate all demo tables/data.

If the demo database has already been seeded, do not run `seed-demo` again. Keep the existing database so your demo applications remain intact.

### Terminal 2 — frontend
```powershell
npm install
npm run dev
```
Open the URL printed by Vite (usually `http://localhost:5173`). Backend health: `http://127.0.0.1:8000/api/health`.

## Demo login

Use the **Explore with a demo account** buttons on the login page after the database has been seeded. If you use email/password, the shared demo password is the one printed by `seed-demo` at the time the database was seeded. It is not recoverable from the database because only password hashes are stored.

A `401` means credentials/token are invalid; sign out and use a demo button or the correct password. A `503` on demo login means the corresponding seeded demo user is missing. Run `python -m app.cli seed-demo` only if this is a fresh empty database. Do not delete `nexus_dev.db` or run `seed-demo --force` just to fix login.

## Upload a document

1. Sign in as **Institution** using the demo button.
2. Open Applications and choose an application belonging to that institution.
3. Open the Documents tab.
4. Choose a document type and select a PDF under 10 MB, then click **Upload PDF**.
5. Sign in as a **Scrutiny Officer**, open the same application and Documents tab, and download or Verify/Reject the uploaded document.
6. Check Audit Trail for the upload and verification events.

Uploads are stored under `backend/uploads/` and the database stores their metadata. This local storage is for demonstration only; use private object storage, malware scanning, and production deployment hardening before real-world use.
