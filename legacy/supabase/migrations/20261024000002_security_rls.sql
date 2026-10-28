-- Security: helper functions, RLS, privileges and profile guard. Deny by default.
-- Demo authorization model; review with a security professional before any real-world use.
create function public.current_role_name() returns text language sql stable security definer set search_path = '' as
  $$ select role::text from public.profiles where id = auth.uid() and is_active $$;
create function public.my_institution() returns uuid language sql stable security definer set search_path = '' as
  $$ select institution_id from public.profiles where id = auth.uid() and is_active $$;
create function public.my_region() returns text language sql stable security definer set search_path = '' as
  $$ select region_code from public.profiles where id = auth.uid() and is_active $$;
-- Single source of truth for which applications a user may see. Child tables reuse it.
create function public.app_visible(p_app uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.applications a join public.profiles p on p.id = auth.uid() and p.is_active
    where a.id = p_app and (p.role = 'admin'
      or (p.role = 'regional' and a.region_code = p.region_code)
      or (p.role = 'scrutiny' and a.assigned_officer = p.id)
      or (p.role = 'institution' and a.institution_id = p.institution_id)
      or (p.role = 'evc' and exists (select 1 from public.evc_assignments e where e.application_id = a.id and e.member_id = p.id)))) $$;
create function public.institution_has_visible_app(p_inst uuid) returns boolean language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.applications a where a.institution_id = p_inst and public.app_visible(a.id)) $$;

-- ---------- privileges: revoke everything, grant the minimum ----------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on public.profiles, public.institutions, public.workflow_stage_config, public.app_settings to authenticated;  -- RLS limits writes to admins
grant insert on public.applications to authenticated;
grant insert, update on public.documents, public.compliance_requirements to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant usage on sequence public.compliance_ref_seq to authenticated;  -- default value of compliance_requirements.reference
revoke all on function public.touch_updated_at(), public.escalation_level_for(int) from public, anon;
grant execute on function public.current_role_name(), public.my_institution(), public.my_region(), public.app_visible(uuid), public.institution_has_visible_app(uuid), public.escalation_level_for(int) to authenticated;
revoke all on function public.current_role_name(), public.my_institution(), public.my_region(), public.app_visible(uuid), public.institution_has_visible_app(uuid) from public, anon;

-- ---------- profile guard: no self-promotion ----------
create function public.guard_profile_update() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id <> old.id then raise exception 'profile id is immutable' using errcode = '42501'; end if;
  if auth.uid() is not null and public.current_role_name() is distinct from 'admin' then
    if new.role <> old.role or new.institution_id is distinct from old.institution_id or new.region_code is distinct from old.region_code or new.is_active <> old.is_active then
      raise exception 'only an administrator can change role, scope or status' using errcode = '42501'; end if; end if;
  return new; end $$;
create trigger guard_profiles before update on public.profiles for each row execute function public.guard_profile_update();
create function public.guard_profile_insert() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and public.current_role_name() is distinct from 'admin' then raise exception 'only an administrator can create profiles' using errcode = '42501'; end if;
  return new; end $$;
create trigger guard_profiles_ins before insert on public.profiles for each row execute function public.guard_profile_insert();

-- EVC assignees must hold the evc role.
create function public.guard_evc_member() returns trigger language plpgsql security definer set search_path = '' as $$
begin if not exists (select 1 from public.profiles where id = new.member_id and role = 'evc') then raise exception 'assignee must be an EVC committee member'; end if; return new; end $$;
create trigger guard_evc_assignments before insert or update on public.evc_assignments for each row execute function public.guard_evc_member();

-- ---------- RLS ----------
do $$ declare t text; begin
  for t in select unnest(array['regions','workflow_stage_config','app_settings','workflow_actions','institutions','profiles','applications','application_stage_history','observations','documents',
    'compliance_requirements','evidence_submissions','evc_visits','evc_assignments','evc_reports','escalations','notifications','audit_events']) loop
    execute format('alter table public.%I enable row level security', t); end loop; end $$;

create policy ref_read on public.regions for select to authenticated using (true);
create policy stage_cfg_read on public.workflow_stage_config for select to authenticated using (true);
create policy stage_cfg_admin_ins on public.workflow_stage_config for insert to authenticated with check (public.current_role_name() = 'admin');
create policy stage_cfg_admin_upd on public.workflow_stage_config for update to authenticated using (public.current_role_name() = 'admin') with check (public.current_role_name() = 'admin');
create policy settings_read on public.app_settings for select to authenticated using (true);
create policy settings_admin_ins on public.app_settings for insert to authenticated with check (public.current_role_name() = 'admin');
create policy settings_admin_upd on public.app_settings for update to authenticated using (public.current_role_name() = 'admin') with check (public.current_role_name() = 'admin');
create policy actions_read on public.workflow_actions for select to authenticated using (true);

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.current_role_name() in ('admin', 'regional', 'scrutiny', 'evc'));
create policy profiles_admin_ins on public.profiles for insert to authenticated with check (public.current_role_name() = 'admin');
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid() or public.current_role_name() = 'admin') with check (id = auth.uid() or public.current_role_name() = 'admin');

create policy inst_read on public.institutions for select to authenticated using (
  public.current_role_name() = 'admin' or id = public.my_institution() or (public.current_role_name() = 'regional' and region_code = public.my_region()) or public.institution_has_visible_app(id));
create policy inst_admin_ins on public.institutions for insert to authenticated with check (public.current_role_name() = 'admin');
create policy inst_admin_upd on public.institutions for update to authenticated using (public.current_role_name() = 'admin') with check (public.current_role_name() = 'admin');

create policy apps_read on public.applications for select to authenticated using (public.app_visible(id));
create policy apps_insert on public.applications for insert to authenticated with check (
  public.current_role_name() = 'admin' or (public.current_role_name() = 'institution' and institution_id = public.my_institution() and stage in ('DRAFT', 'SUBMITTED') and assigned_officer is null));
create policy history_read on public.application_stage_history for select to authenticated using (public.app_visible(application_id));
create policy obs_read on public.observations for select to authenticated using (public.app_visible(application_id));

create policy docs_read on public.documents for select to authenticated using (public.app_visible(application_id));
create policy docs_insert on public.documents for insert to authenticated with check (
  public.current_role_name() = 'institution' and institution_id = public.my_institution() and public.app_visible(application_id) and uploaded_by = auth.uid() and verification_status = 'PENDING');
create policy docs_verify on public.documents for update to authenticated using (public.current_role_name() in ('admin', 'regional', 'scrutiny') and public.app_visible(application_id))
  with check (public.current_role_name() in ('admin', 'regional', 'scrutiny') and public.app_visible(application_id));

create policy comp_read on public.compliance_requirements for select to authenticated using (public.app_visible(application_id));
create policy comp_insert on public.compliance_requirements for insert to authenticated with check (public.current_role_name() in ('admin', 'regional') and public.app_visible(application_id) and state = 'NOT_SUBMITTED');
create policy comp_update on public.compliance_requirements for update to authenticated using (public.current_role_name() in ('admin', 'regional') and public.app_visible(application_id))
  with check (public.current_role_name() in ('admin', 'regional') and public.app_visible(application_id));
create policy evid_read on public.evidence_submissions for select to authenticated using (public.app_visible(application_id));

create policy evc_read on public.evc_visits for select to authenticated using (public.app_visible(application_id));
create policy evc_assign_read on public.evc_assignments for select to authenticated using (public.app_visible(application_id));
create policy evc_report_read on public.evc_reports for select to authenticated using (public.app_visible(application_id));

create policy esc_read on public.escalations for select to authenticated using (public.current_role_name() in ('admin', 'regional', 'scrutiny') and public.app_visible(application_id));
create policy notif_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_mark_read on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy audit_read on public.audit_events for select to authenticated using (public.current_role_name() = 'admin' or (application_id is not null and public.app_visible(application_id)));
