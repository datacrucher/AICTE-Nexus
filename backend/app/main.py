from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from .config import get_settings
from .routers import alerts, applications, auth, dashboard, escalations

s = get_settings()
app = FastAPI(title="AICTE Nexus API", version="1.0", docs_url=None if s.env == "production" else "/docs", redoc_url=None, openapi_url=None if s.env == "production" else "/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=False, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])

@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request); resp.headers["X-Content-Type-Options"] = "nosniff"; resp.headers["Cache-Control"] = "no-store"; return resp

@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, exc: StarletteHTTPException):
    return JSONResponse({"detail": exc.detail, "code": exc.status_code}, status_code=exc.status_code, headers=getattr(exc, "headers", None))
@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    msg = "; ".join(f"{'.'.join(str(p) for p in e['loc'][1:]) or e['loc'][0]}: {e['msg']}" for e in exc.errors())
    return JSONResponse({"detail": msg, "code": 422}, status_code=422)
@app.exception_handler(Exception)
async def unexpected(_: Request, exc: Exception):
    return JSONResponse({"detail": "Internal server error", "code": 500}, status_code=500)   # details stay in server logs only

for r in (auth.router, applications.router, dashboard.router, alerts.router, escalations.router): app.include_router(r, prefix="/api")
@app.get("/api/health")
def health(): return {"status": "ok"}
