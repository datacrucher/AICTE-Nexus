-- Migration 7: read-only dashboard aggregates. security_invoker: every count is computed under the CALLER's RLS, so each role
-- only counts what it may already see. No new tables, no write access.
create view public.dashboard_metrics with (security_invoker = true) as
select
  (select count(*) from public.application_overview)::int as total_applications,
  (select count(*) from public.application_overview where stage not in ('APPROVED', 'REJECTED'))::int as pending_applications,
  (select count(*) from public.application_overview where stage = 'APPROVED')::int as approved_applications,
  (select count(*) from public.application_overview where sla_status = 'OVERDUE')::int as overdue_applications,
  (select count(*) from public.escalations where status <> 'RESOLVED')::int as open_escalations,
  (select count(*) from public.compliance_requirements where state in ('NOT_SUBMITTED', 'REJECTED') and due_at < now())::int as overdue_compliance,
  (select count(*) from public.evc_visits where status = 'SCHEDULED' and scheduled_for >= now())::int as upcoming_evc_visits,
  (select count(*) from public.evc_visits where status = 'COMPLETED' and report_status = 'PENDING')::int as pending_evc_reports,
  -- Critical alerts (same CRITICAL rules the Alerts page uses today): overdue stage SLA + lease expired/within the critical tier + overdue compliance.
  ((select count(*) from public.application_overview where sla_status = 'OVERDUE')
   + (select count(*) from public.application_overview where lease_days <= coalesce((select max((s ->> 0)::int) from public.app_settings a, jsonb_array_elements(a.value) s where a.key = 'doc_alert_steps' and s ->> 1 = 'CRITICAL'), -1))
   + (select count(*) from public.compliance_requirements where state in ('NOT_SUBMITTED', 'REJECTED') and due_at < now()))::int as critical_alerts;
create view public.dashboard_stage_counts with (security_invoker = true) as
  select stage, count(*)::int as applications from public.application_overview group by stage;
create view public.dashboard_region_overdue with (security_invoker = true) as
  select region_name, count(*) filter (where sla_status = 'OVERDUE')::int as overdue from public.application_overview group by region_name;
grant select on public.dashboard_metrics, public.dashboard_stage_counts, public.dashboard_region_overdue to authenticated;
