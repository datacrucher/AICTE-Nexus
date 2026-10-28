-- Migration 6: security hardening (additive; earlier migrations are unchanged).
-- Fixes confirmed by the audit: direct compliance verification, document field tampering, foreign storage paths,
-- over-broad profile reads, and staff-written remarks leaking to institutions.

-- ---------- 1. Compliance: state changes only through submit_evidence / review_evidence ----------
-- Column-level privileges: clients can still edit these descriptive fields (admin/regional via RLS); `state` is not writable by any client.
revoke update on public.compliance_requirements from authenticated;
grant update (title, description, due_at, verifier_id) on public.compliance_requirements to authenticated;

-- ---------- 2. Documents: only the verification outcome may be updated by staff; the file/expiry facts are immutable to clients ----------
revoke update on public.documents from authenticated;
grant update (verification_status) on public.documents to authenticated;

-- ---------- 3. Storage paths must be <institution_id>/<application_id>/<file> of the record's own institution and application ----------
alter table public.documents add constraint documents_storage_path_scope check (
  storage_path is null or (storage_path ~ ('^' || institution_id::text || '/' || application_id::text || '/[^/]+$') and storage_path !~ '\.\.'));
create function public.guard_evidence_path() returns trigger language plpgsql security definer set search_path = '' as $$
declare inst uuid;
begin
  if new.storage_path is not null then
    select institution_id into inst from public.applications where id = new.application_id;
    if new.storage_path !~ ('^' || inst::text || '/' || new.application_id::text || '/[^/]+$') or new.storage_path ~ '\.\.' then
      raise exception 'storage_path must be <institution_id>/<application_id>/<file> for this application' using errcode = '23514'; end if; end if;
  return new; end $$;
create trigger guard_evidence_storage_path before insert or update of storage_path on public.evidence_submissions for each row execute function public.guard_evidence_path();
-- Uploads: exactly three path segments, no traversal, own institution folder, an application the caller may see.
create or replace function public.storage_object_uploadable(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_role_name() = 'institution'
    and p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
    and p_name !~ '\.\.'
    and split_part(p_name, '/', 1) = public.my_institution()::text
    and coalesce(public.app_visible(public.storage_object_app(p_name)), false) $$;

-- ---------- 4. Profiles: own row (admins: all). Staff names come from a minimal directory view instead ----------
drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.current_role_name() = 'admin');
-- No security_invoker on purpose: the view applies its own filter and exposes only id, full_name, role of active staff, and only to staff roles.
create view public.staff_directory as
select p.id, p.full_name, p.role from public.profiles p
where p.is_active and p.role <> 'institution' and public.current_role_name() in ('admin', 'regional', 'scrutiny', 'evc');

-- ---------- 5. Institutions must not read staff-written remarks, staff identities or escalation activity ----------
drop policy history_read on public.application_stage_history;
create policy history_read_staff on public.application_stage_history for select to authenticated
  using (public.current_role_name() in ('admin', 'regional', 'scrutiny', 'evc') and public.app_visible(application_id));
drop policy audit_read on public.audit_events;
create policy audit_read_staff on public.audit_events for select to authenticated
  using (public.current_role_name() = 'admin' or (public.current_role_name() in ('regional', 'scrutiny', 'evc') and application_id is not null and public.app_visible(application_id)));
-- Role-aware views (explicit filters). Institutions see their own application's events, but staff remarks and identities are masked.
create view public.audit_trail as
select e.id, e.occurred_at, e.application_id, e.action, e.target_type, e.target_ref, e.from_value, e.to_value, e.is_seed, e.actor_role,
  case when me.role = 'institution' and e.actor_role is distinct from 'institution' then null else e.actor_id end as actor_id,
  case when me.role = 'institution' and e.actor_role is distinct from 'institution' then null else e.remarks end as remarks
from public.audit_events e cross join (select public.current_role_name() as role) me
where me.role is not null and (me.role = 'admin' or (e.application_id is not null and public.app_visible(e.application_id)))
  and (me.role <> 'institution' or e.target_type is distinct from 'escalations');
create view public.stage_timeline as
select h.id, h.application_id, h.from_stage, h.to_stage, h.created_at,
  case when me.role = 'institution' and not coalesce(a.is_inst, false) then null else h.changed_by end as changed_by,
  case when me.role = 'institution' and not coalesce(a.is_inst, false) then null else h.remarks end as remarks
from public.application_stage_history h cross join (select public.current_role_name() as role) me
left join lateral (select p.role = 'institution' as is_inst from public.profiles p where p.id = h.changed_by) a on true
where me.role is not null and public.app_visible(h.application_id);
grant select on public.staff_directory, public.audit_trail, public.stage_timeline to authenticated;

-- ---------- 6. Overview: officer names now come from the minimal directory (profiles are no longer broadly readable) ----------
create or replace view public.application_overview with (security_invoker = true) as
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
  left join public.staff_directory p on p.id = a.assigned_officer
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
