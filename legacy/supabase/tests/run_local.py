# Local validation (NOT a live Supabase test): pip install pgserver; download a PostgREST binary to /tmp/postgrest (or set POSTGREST_BIN);
#   python3 supabase/tests/run_local.py
# DB "nexus_sql": migrations + seed + SQL security/overview tests.  DB "nexus_api": fresh copy served by real PostgREST for the HTTP tests in tests/.
import pgserver, subprocess, glob, os, shutil, sys, time, socket
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
S = ROOT + '/supabase/'
DATA, PGRST, SECRET = '/tmp/nexus_pgdata', os.environ.get('POSTGREST_BIN', '/tmp/postgrest'), 'nexus-local-test-secret-0123456789abcdef'
shutil.rmtree(DATA, ignore_errors=True)
srv = pgserver.get_server(DATA, cleanup_mode='stop')
BASE = srv.get_uri()
PSQL = glob.glob(os.path.dirname(pgserver.__file__) + '/pginstall/bin/psql')[0]
uri = lambda db: BASE.replace('/postgres?', f'/{db}?')
def psql(db, *args):
    return subprocess.run([PSQL, uri(db), '-v', 'ON_ERROR_STOP=1', '-q', *args], capture_output=True, text=True)
def run_file(db, rel, show=False):
    r = psql(db, *(['-1'] if rel.startswith('migrations/') else []), '-f', S + rel); out = (r.stdout + r.stderr)   # migrations run in ONE transaction each, as `supabase db push` does
    if r.returncode: print(f'--- {rel}: FAILED\n{out[-3000:]}'); sys.exit(1)
    if show: return out
    return out
def build(db):
    psql('postgres', '-c', f'create database {db}')
    for f in ['tests/00_supabase_stubs.sql'] + sorted(os.path.relpath(p, S) for p in glob.glob(S + 'migrations/*.sql')) + ['seed.sql']: run_file(db, f)
print(srv.psql('select version();').strip().splitlines()[2].strip())
psql('postgres', '-c', "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role authenticator login noinherit; grant anon, authenticated to authenticator;")
build('nexus_sql')
sql_ok = 0
run_file('nexus_sql', 'tests/01_test_helpers.sql')
sql_ok += run_file('nexus_sql', 'tests/05_overview_tests.sql').count('NOTICE:  ok')
sql_ok += run_file('nexus_sql', 'tests/06_dashboard_tests.sql').count('NOTICE:  ok')
open('/tmp/nexus_metrics.json', 'w').write(psql('nexus_sql', '-At', '-c', 'select row_to_json(m) from public.dashboard_metrics m').stdout)
open('/tmp/nexus_overview.json', 'w').write(psql('nexus_sql', '-At', '-c', "select coalesce(json_agg(json_build_object('reference', reference, 'risk_score', risk_score, 'risk_level', risk_level, 'sla_status', sla_status, 'escalation_level', escalation_level)), '[]') from public.application_overview").stdout)
out = run_file('nexus_sql', 'tests/10_security_tests.sql')
sql_ok += out.count('NOTICE:  ok')
out2 = run_file('nexus_sql', 'tests/20_hardening_tests.sql'); sql_ok += out2.count('NOTICE:  ok')
print('SQL checks:', sql_ok, 'expectations passed' if 'ALL SECURITY TESTS PASSED' in out and 'ALL HARDENING TESTS PASSED' in out2 else 'FAILED')
if os.path.exists(ROOT + '/tests/run.mjs') and os.path.exists(PGRST):
    build('nexus_api')
    env = {**os.environ, 'PGRST_DB_URI': f'postgresql://authenticator@/nexus_api?host={DATA}', 'PGRST_DB_SCHEMAS': 'public', 'PGRST_DB_ANON_ROLE': 'anon', 'PGRST_JWT_SECRET': SECRET, 'PGRST_SERVER_PORT': '3100', 'PGRST_DB_POOL': '4'}
    pg = subprocess.Popen([PGRST], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for _ in range(60):
        try: socket.create_connection(('127.0.0.1', 3100), 0.3).close(); break
        except OSError:
            if pg.poll() is not None: print('PostgREST exited:', pg.stdout.read()[-1500:]); sys.exit(1)
            time.sleep(0.25)
    try:
        r = subprocess.run(['node', 'tests/run.mjs'], cwd=ROOT, env={**os.environ, 'NEXUS_TEST_POSTGREST': 'http://127.0.0.1:3100', 'NEXUS_TEST_JWT_SECRET': SECRET, 'NEXUS_PARITY_JSON': '/tmp/nexus_overview.json', 'NEXUS_PARITY_METRICS_JSON': '/tmp/nexus_metrics.json'})
    finally: pg.terminate()
    sys.exit(r.returncode)
