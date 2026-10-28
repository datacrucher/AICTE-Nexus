-- LOCAL VALIDATION of migration 7 on freshly seeded data (runs before any mutating test).
\set ON_ERROR_STOP on
create function tests.dash_ok(label text) returns void language plpgsql as $$ declare m public.dashboard_metrics;
begin select * into m from public.dashboard_metrics;
  if (select coalesce(sum(applications), 0) from public.dashboard_stage_counts) <> m.total_applications then raise exception 'FAIL: % stage counts do not add up', label; end if;
  if (select coalesce(sum(overdue), 0) from public.dashboard_region_overdue) <> m.overdue_applications then raise exception 'FAIL: % region overdue does not add up', label; end if;
  if m.open_escalations <> (select count(*) from public.escalations where status <> 'RESOLVED') then raise exception 'FAIL: % escalations differ from RLS-visible rows', label; end if;
  raise notice 'ok   % (aggregates consistent with RLS-visible rows)', label; end $$;
grant execute on function tests.dash_ok(text) to authenticated;
\echo == dashboard metrics: admin ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-admin-0')::uuid::text, false); set role authenticated;
select tests.eq('admin totals', (select total_applications || '/' || pending_applications || '/' || approved_applications from public.dashboard_metrics), '30/30/0');
select tests.eq('overdue matches the overview', (select overdue_applications from public.dashboard_metrics)::text, (select count(*) from public.application_overview where sla_status = 'OVERDUE')::text);
select tests.eq('open escalations (seeded)', (select open_escalations from public.dashboard_metrics)::text, '17');
select tests.eq('overdue compliance', (select overdue_compliance from public.dashboard_metrics)::text, '3');
select tests.eq('upcoming EVC visits', (select upcoming_evc_visits from public.dashboard_metrics)::text, '1');
select tests.eq('pending EVC reports', (select pending_evc_reports from public.dashboard_metrics)::text, '0');
select tests.eq('critical alerts = overdue + critical-tier leases + overdue compliance', (select critical_alerts from public.dashboard_metrics)::text,
  ((select count(*) from public.application_overview where sla_status = 'OVERDUE') + (select count(*) from public.documents where doc_type = 'LEASE' and expiry_date <= current_date + 7) + 3)::text);
select tests.dash_ok('admin');
reset role;
\echo == dashboard metrics: every role is scoped by RLS ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-institution-0')::uuid::text, false); set role authenticated;
select tests.eq('institution sees only its 3 applications', (select total_applications from public.dashboard_metrics)::text, '3');
select tests.eq('institution counts no escalations', (select open_escalations from public.dashboard_metrics)::text, '0');
select tests.dash_ok('institution');
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-regional-0')::uuid::text, false); set role authenticated;
select tests.eq('regional sees only its region (6)', (select total_applications from public.dashboard_metrics)::text, '6');
select tests.eq('region chart only lists its region', (select string_agg(region_name, ',') from public.dashboard_region_overdue), 'Southern');
select tests.dash_ok('regional');
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-scrutiny-0')::uuid::text, false); set role authenticated;
select tests.eq('scrutiny sees only assigned applications (4)', (select total_applications from public.dashboard_metrics)::text, '4');
select tests.dash_ok('scrutiny');
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-evc-0')::uuid::text, false); set role authenticated;
select tests.eq('EVC member sees its 2 applications and 1 upcoming visit', (select total_applications || '/' || upcoming_evc_visits from public.dashboard_metrics), '2/1');
select tests.dash_ok('evc');
reset role;
set role anon;
select tests.denied('anon cannot read dashboard metrics', 'select * from public.dashboard_metrics');
select tests.denied('anon cannot read stage counts', 'select * from public.dashboard_stage_counts');
reset role;
