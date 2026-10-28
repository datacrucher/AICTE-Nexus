-- LOCAL VALIDATION: read-only checks of application_overview on freshly seeded data (run before any mutating test).
\set ON_ERROR_STOP on
\echo == application_overview (admin) ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-admin-0')::uuid::text, false); set role authenticated;
select tests.eq('admin sees 30 overview rows', (select count(*) from public.application_overview)::text, '30');
select tests.eq('app 0: lease expired + compliance overdue = 50 / HIGH / ON_TRACK', (select risk_score || '/' || risk_level || '/' || sla_status from public.application_overview where reference = 'AICTE-2026-1001'), '50/HIGH/ON_TRACK');
select tests.eq('app 0 has two risk reasons', (select cardinality(risk_reasons)::text from public.application_overview where reference = 'AICTE-2026-1001'), '2');
select tests.eq('app 2: overdue 8 days, lease soon = 50 / HIGH / OVERDUE / level 3', (select risk_score || '/' || risk_level || '/' || sla_status || '/' || escalation_level from public.application_overview where reference = 'AICTE-2026-1015'), '50/HIGH/OVERDUE/3');
select tests.eq('admin sees officer names', (select count(*) from public.application_overview where officer_name is null)::text, '0');
reset role;
\echo == application_overview (tenant isolation) ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-institution-0')::uuid::text, false); set role authenticated;
select tests.eq('institution 0 sees only its 3 rows', (select count(*) from public.application_overview)::text, '3');
select tests.eq('institution cannot read officer profiles (names hidden)', (select count(*) from public.application_overview where officer_name is null)::text, '3');
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-regional-0')::uuid::text, false); set role authenticated;
select tests.eq('regional 0 sees only Southern (6 rows)', (select count(*) from public.application_overview where region_name <> 'Southern')::text || '/' || (select count(*) from public.application_overview)::text, '0/6');
reset role;
set role anon;
select tests.denied('anon cannot read the view', 'select count(*) from public.application_overview');
reset role;
