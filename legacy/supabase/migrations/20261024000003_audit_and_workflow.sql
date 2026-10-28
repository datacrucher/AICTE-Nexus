-- Audit trail, stage history and atomic business functions.
-- Every state change below writes its history and audit rows in the SAME transaction as the change.
-- Note: the audit table is append-only for all application roles and is protected by triggers, but a database owner/superuser can still alter it.
-- Hardening (hash chaining, external log shipping) is future work.

create function public.audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare col text := tg_argv[0]; ref text := tg_argv[1]; o text; n text := to_jsonb(new) ->> tg_argv[0];
begin
  if coalesce(current_setting('nexus.seed', true), '') = 'on' then return new; end if;
  if tg_op = 'UPDATE' then o := to_jsonb(old) ->> col; if o is not distinct from n then return new; end if; end if;
  insert into public.audit_events (actor_id, actor_role, action, application_id, target_type, target_ref, from_value, to_value, remarks)
  values (auth.uid(), coalesce(public.current_role_name(), 'system'), tg_table_name || ' ' || lower(tg_op), nullif(to_jsonb(new) ->> 'application_id', '')::uuid,
          tg_table_name, to_jsonb(new) ->> ref, o, n, nullif(current_setting('nexus.remarks', true), ''));
  return new; end $$;
create trigger audit_compliance after insert or update on public.compliance_requirements for each row execute function public.audit_change('state', 'reference');
create trigger audit_evidence after insert or update on public.evidence_submissions for each row execute function public.audit_change('decision', 'id');
create trigger audit_documents after insert or update on public.documents for each row execute function public.audit_change('verification_status', 'id');
create trigger audit_observations after insert or update on public.observations for each row execute function public.audit_change('status', 'id');
create trigger audit_evc_visits after insert or update on public.evc_visits for each row execute function public.audit_change('status', 'reference');
create trigger audit_escalations after insert or update on public.escalations for each row execute function public.audit_change('status', 'id');

-- Application creation and stage changes: history + audit, written by the database, not the client.
create function public.applications_before_insert() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select region_code into new.region_code from public.institutions where id = new.institution_id;
  if auth.uid() is not null or new.reference is null then
    new.reference := 'AICTE-' || to_char(now(), 'YYYY') || '-' || nextval('public.application_ref_seq'); end if;
  if auth.uid() is not null then
    new.stage_started_at := now(); new.created_at := now(); new.updated_at := now(); new.created_by := auth.uid();
    new.submitted_at := case when new.stage = 'SUBMITTED' then now() end; end if;
  return new; end $$;
create trigger applications_bi before insert on public.applications for each row execute function public.applications_before_insert();
create function public.applications_after_insert() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('nexus.seed', true), '') = 'on' then return new; end if;
  insert into public.application_stage_history (application_id, from_stage, to_stage, changed_by) values (new.id, null, new.stage, auth.uid());
  insert into public.audit_events (actor_id, actor_role, action, application_id, target_type, target_ref, to_value)
    values (auth.uid(), coalesce(public.current_role_name(), 'system'), 'Application created', new.id, 'applications', new.reference, new.stage);
  return new; end $$;
create trigger applications_ai after insert on public.applications for each row execute function public.applications_after_insert();
create function public.applications_stage_changed() returns trigger language plpgsql security definer set search_path = '' as $$
declare note text := nullif(current_setting('nexus.remarks', true), '');
begin
  if coalesce(current_setting('nexus.seed', true), '') = 'on' or new.stage = old.stage then return new; end if;
  insert into public.application_stage_history (application_id, from_stage, to_stage, changed_by, remarks) values (new.id, old.stage, new.stage, auth.uid(), note);
  insert into public.audit_events (actor_id, actor_role, action, application_id, target_type, target_ref, from_value, to_value, remarks)
    values (auth.uid(), coalesce(public.current_role_name(), 'system'), 'Stage changed', new.id, 'applications', new.reference, old.stage, new.stage, note);
  return new; end $$;
create trigger applications_stage_au after update of stage on public.applications for each row execute function public.applications_stage_changed();

-- Client-insertable tables: created_at is always set by the database, never by the client.
create function public.force_created_now() returns trigger language plpgsql as $$ begin if auth.uid() is not null then new.created_at := now(); end if; return new; end $$;
create trigger documents_created before insert on public.documents for each row execute function public.force_created_now();
create trigger compliance_created before insert on public.compliance_requirements for each row execute function public.force_created_now();

-- Audit table is append-only.
create function public.audit_immutable() returns trigger language plpgsql as $$ begin raise exception 'audit_events is append-only' using errcode = '42501'; end $$;
create trigger audit_no_update before update or delete on public.audit_events for each row execute function public.audit_immutable();
create trigger audit_no_truncate before truncate on public.audit_events for each statement execute function public.audit_immutable();

-- ---------- atomic business functions (the only write path for workflow, evidence and escalations) ----------
create function public.transition_application(p_app uuid, p_action text, p_remarks text default null) returns public.applications
language plpgsql security definer set search_path = '' as $$
declare a public.applications; r text := public.current_role_name(); wa public.workflow_actions; note text := nullif(btrim(p_remarks), '');
begin
  if auth.uid() is null or r is null then raise exception 'Not authenticated or inactive' using errcode = '42501'; end if;
  select * into a from public.applications where id = p_app for update;
  if not found or not public.app_visible(p_app) then raise exception 'Application not found or not visible' using errcode = '42501'; end if;
  select * into wa from public.workflow_actions where action_id = p_action and role = r::public.app_role and from_stage = a.stage;
  if not found then raise exception 'Action % is not permitted for role % in stage %', p_action, r, a.stage using errcode = '42501'; end if;
  if p_action = 'complete' and exists (select 1 from public.observations where application_id = p_app and status = 'OPEN') then raise exception 'Close all observations first'; end if;
  perform set_config('nexus.remarks', coalesce(note, ''), true);
  if p_action = 'raise' then
    insert into public.observations (application_id, seq, body, raised_by)
    values (p_app, coalesce((select max(seq) from public.observations where application_id = p_app), 0) + 1, coalesce(note, 'Observation raised by scrutiny officer'), auth.uid()); end if;
  if p_action = 'respond' then
    update public.observations set status = 'RESPONDED', response_text = note, responded_by = auth.uid(), responded_at = now() where application_id = p_app and status = 'OPEN'; end if;
  update public.applications set stage = wa.to_stage, stage_started_at = now() where id = p_app returning * into a;
  return a; end $$;

create function public.submit_evidence(p_compliance uuid, p_file_name text, p_storage_path text, p_file_size bigint, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.compliance_requirements; new_id uuid;
begin
  if public.current_role_name() is distinct from 'institution' then raise exception 'Only institution users may submit evidence' using errcode = '42501'; end if;
  select * into c from public.compliance_requirements where id = p_compliance for update;
  if not found or not public.app_visible(c.application_id) then raise exception 'Requirement not found or not visible' using errcode = '42501'; end if;
  if c.state not in ('NOT_SUBMITTED', 'REJECTED') then raise exception 'Evidence is already submitted for this requirement'; end if;
  if btrim(coalesce(p_file_name, '')) = '' then raise exception 'A supporting file is required'; end if;
  if p_file_size is null or p_file_size < 0 or p_file_size > 5242880 then raise exception 'File exceeds the 5 MB demo limit'; end if;
  perform set_config('nexus.remarks', coalesce(p_note, ''), true);
  insert into public.evidence_submissions (compliance_id, application_id, file_name, storage_path, file_size, note, submitted_by)
    values (c.id, c.application_id, p_file_name, p_storage_path, p_file_size, p_note, auth.uid()) returning id into new_id;
  update public.compliance_requirements set state = 'SUBMITTED' where id = c.id;
  return new_id; end $$;

create function public.review_evidence(p_evidence uuid, p_decision text, p_remarks text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.evidence_submissions; c public.compliance_requirements; v_note text := nullif(btrim(p_remarks), '');
begin
  if public.current_role_name() is distinct from 'regional' then raise exception 'Only regional officers may review evidence' using errcode = '42501'; end if;
  select * into e from public.evidence_submissions where id = p_evidence for update;
  if not found or not public.app_visible(e.application_id) then raise exception 'Evidence not found or not visible' using errcode = '42501'; end if;
  if p_decision not in ('VERIFIED', 'REJECTED') then raise exception 'Unknown decision'; end if;
  if p_decision = 'REJECTED' and v_note is null then raise exception 'Remarks are required when rejecting evidence'; end if;
  select * into c from public.compliance_requirements where id = e.compliance_id for update;
  if e.decision <> 'PENDING' or c.state <> 'SUBMITTED' then raise exception 'Only submitted evidence awaiting review can be verified or rejected'; end if;
  perform set_config('nexus.remarks', coalesce(v_note, ''), true);
  update public.evidence_submissions set decision = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_remarks = v_note where id = e.id;
  update public.compliance_requirements set state = p_decision where id = c.id; end $$;

create function public.act_on_escalation(p_escalation uuid, p_kind text, p_remarks text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.escalations; r text := public.current_role_name(); note text := nullif(btrim(p_remarks), '');
begin
  select * into e from public.escalations where id = p_escalation for update;
  if not found or r is null or not public.app_visible(e.application_id) then raise exception 'Escalation not found or not visible' using errcode = '42501'; end if;
  if p_kind = 'acknowledge' and r in ('admin', 'regional') then
    if e.status <> 'OPEN' then raise exception 'Only open escalations can be acknowledged'; end if;
    perform set_config('nexus.remarks', coalesce(note, ''), true);
    update public.escalations set status = 'ACKNOWLEDGED', acknowledged_by = auth.uid(), acknowledged_at = now() where id = e.id;
  elsif p_kind = 'resolve' and r = 'admin' then
    if e.status = 'RESOLVED' then raise exception 'Escalation is already resolved'; end if;
    if note is null then raise exception 'Remarks are required to resolve an escalation'; end if;
    perform set_config('nexus.remarks', note, true);
    update public.escalations set status = 'RESOLVED', resolved_by = auth.uid(), resolved_at = now(), resolution_remarks = note where id = e.id;
  else raise exception 'Role % may not % escalations', r, p_kind using errcode = '42501'; end if; end $$;

revoke all on function public.transition_application(uuid, text, text), public.submit_evidence(uuid, text, text, bigint, text), public.review_evidence(uuid, text, text), public.act_on_escalation(uuid, text, text) from public, anon;
grant execute on function public.transition_application(uuid, text, text), public.submit_evidence(uuid, text, text, bigint, text), public.review_evidence(uuid, text, text), public.act_on_escalation(uuid, text, text) to authenticated;
