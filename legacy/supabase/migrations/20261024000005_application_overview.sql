-- Read-only overview for the Applications module: SLA, risk and escalation computed server-side from DEMO settings.
-- security_invoker: the caller's RLS applies, so users only see applications they are allowed to see.
insert into public.app_settings (key, value, note) values
  ('risk_levels', '[[20,"LOW"],[40,"MEDIUM"],[65,"HIGH"],[null,"CRITICAL"]]', 'Demo: [score below, level]; null = no upper bound')
on conflict (key) do nothing;

create view public.application_overview with (security_invoker = true) as
with facts as (
  select a.id, a.reference, a.institution_id, a.region_code, a.application_type, a.stage, a.stage_started_at, a.submitted_at, a.assigned_officer, a.priority,
    i.name as institution_name, r.name as region_name, p.full_name as officer_name,
    s.days_in_stage, s.sla_days, s.remaining_days, s.sla_status,
    (select max(d.expiry_date) from public.documents d where d.application_id = a.id and d.doc_type = 'LEASE') - current_date as lease_days,
    (select count(*) from public.observations o where o.application_id = a.id and o.status = 'OPEN')::int as open_observations,
    (select min(floor(extract(epoch from c.due_at - now()) / 86400))::int from public.compliance_requirements c
       where c.application_id = a.id and c.state in ('NOT_SUBMITTED', 'REJECTED') and c.due_at < now()) as compliance_overdue_days,
    (select value from public.app_settings where key = 'risk_weights') as w
  from public.applications a
  join public.application_sla s on s.id = a.id
  left join public.institutions i on i.id = a.institution_id
  left join public.regions r on r.code = a.region_code
  left join public.profiles p on p.id = a.assigned_officer
), scored as (
  select f.*,
    (case f.sla_status when 'OVERDUE' then (f.w ->> 'overdue')::int when 'AT_RISK' then (f.w ->> 'atRisk')::int else 0 end
     + case when f.lease_days < 0 then (f.w ->> 'leaseExpired')::int when f.lease_days < 30 then (f.w ->> 'leaseExpiring')::int else 0 end
     + f.open_observations * (f.w ->> 'perObservation')::int
     + case when f.compliance_overdue_days < 0 then (f.w ->> 'complianceOverdue')::int else 0 end) as risk_score,
    array_remove(array[
      case f.sla_status when 'OVERDUE' then 'Stage SLA exceeded by ' || (-f.remaining_days) || ' days' when 'AT_RISK' then 'Only ' || f.remaining_days || ' day(s) left in stage SLA' end,
      case when f.lease_days < 0 then 'Lease agreement expired ' || (-f.lease_days) || ' days ago' when f.lease_days < 30 then 'Lease agreement expires in ' || f.lease_days || ' days' end,
      case when f.open_observations > 0 then f.open_observations || ' unresolved observation(s)' end,
      case when f.compliance_overdue_days < 0 then 'Compliance undertaking overdue by ' || (-f.compliance_overdue_days) || ' days' end], null) as risk_reasons
  from facts f)
select s.id, s.reference, s.institution_id, s.region_code, s.institution_name, s.region_name, s.application_type, s.stage, s.stage_started_at, s.submitted_at,
  s.assigned_officer, s.officer_name, s.priority, s.days_in_stage, s.sla_days, s.remaining_days, s.sla_status, s.lease_days, s.open_observations, s.compliance_overdue_days,
  s.risk_score, s.risk_reasons, lv.level as risk_level,
  case when s.sla_status = 'OVERDUE' then public.escalation_level_for(-s.remaining_days) else 0 end as escalation_level,
  case when s.submitted_at is not null then floor(extract(epoch from now() - s.submitted_at) / 86400)::int end as days_pending
from scored s cross join lateral (
  select e.v ->> 1 as level from jsonb_array_elements((select value from public.app_settings where key = 'risk_levels')) with ordinality e(v, o)
  where (e.v ->> 0) is null or s.risk_score < (e.v ->> 0)::int order by e.o limit 1) lv;
grant select on public.application_overview to authenticated;
