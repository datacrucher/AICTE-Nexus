-- AICTE Nexus core schema (demo project, SIH26262). All timeline values in config tables are DEMO values.
-- Timestamps use timestamptz with database defaults. Official AICTE deadlines are NOT encoded here; see workflow_stage_config / app_settings.
create type public.app_role as enum ('admin', 'regional', 'scrutiny', 'institution', 'evc');

-- ---------- configuration (editable by admins, never hard-coded in app code) ----------
create table public.regions (code text primary key, name text not null unique);
create table public.workflow_stage_config (
  stage text primary key, ordinal smallint not null unique,
  sla_days smallint check (sla_days is null or sla_days > 0), is_terminal boolean not null default false,
  config_status text not null default 'DEMO' check (config_status in ('DEMO', 'VERIFIED')), note text);
create table public.app_settings (
  key text primary key, value jsonb not null,
  config_status text not null default 'DEMO' check (config_status in ('DEMO', 'VERIFIED')), note text, updated_at timestamptz not null default now());
create table public.workflow_actions (
  action_id text not null, role public.app_role not null, label text not null,
  from_stage text not null references public.workflow_stage_config (stage), to_stage text not null references public.workflow_stage_config (stage),
  primary key (action_id, role));

-- ---------- identity ----------
create table public.institutions (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  region_code text not null references public.regions (code), is_demo boolean not null default true, created_at timestamptz not null default now());
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (btrim(full_name) <> ''), role public.app_role not null,
  institution_id uuid references public.institutions (id), region_code text references public.regions (code),
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint profiles_institution_scope check ((role = 'institution') = (institution_id is not null)),
  constraint profiles_regional_scope check (role <> 'regional' or region_code is not null));

-- ---------- applications and workflow ----------
create sequence public.application_ref_seq start 2001;
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,  -- assigned by trigger applications_before_insert when omitted or when a client inserts
  institution_id uuid not null references public.institutions (id), region_code text not null references public.regions (code),
  application_type text not null check (application_type in ('New Institution', 'Extension of Approval', 'Intake Increase', 'New Course')),
  stage text not null default 'DRAFT' references public.workflow_stage_config (stage),
  stage_started_at timestamptz not null default now(), submitted_at timestamptz,
  assigned_officer uuid references public.profiles (id) on delete set null,
  priority text not null default 'Normal' check (priority in ('Normal', 'High')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, institution_id));
create index applications_institution_idx on public.applications (institution_id);
create index applications_region_stage_idx on public.applications (region_code, stage);
create index applications_officer_idx on public.applications (assigned_officer);
create index applications_stage_started_idx on public.applications (stage, stage_started_at);

create table public.application_stage_history (
  id bigint generated always as identity primary key, application_id uuid not null references public.applications (id),
  from_stage text references public.workflow_stage_config (stage), to_stage text not null references public.workflow_stage_config (stage),
  changed_by uuid, remarks text, created_at timestamptz not null default now());
create index stage_history_app_idx on public.application_stage_history (application_id, created_at);

create table public.observations (
  id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications (id), seq int not null,
  body text not null check (btrim(body) <> ''), status text not null default 'OPEN' check (status in ('OPEN', 'RESPONDED', 'CLOSED')),
  raised_by uuid references public.profiles (id) on delete set null, raised_at timestamptz not null default now(),
  response_text text, responded_by uuid references public.profiles (id) on delete set null, responded_at timestamptz, unique (application_id, seq));
create index observations_app_status_idx on public.observations (application_id, status);

create table public.documents (
  id uuid primary key default gen_random_uuid(), application_id uuid not null, institution_id uuid not null,
  doc_type text not null check (doc_type in ('LEASE', 'NOC', 'AFFILIATION', 'CERTIFICATE', 'OTHER')),
  issue_date date, expiry_date date check (expiry_date is null or issue_date is null or expiry_date >= issue_date),
  verification_status text not null default 'PENDING' check (verification_status in ('PENDING', 'VERIFIED', 'REJECTED')),
  file_name text, storage_path text, uploaded_by uuid references public.profiles (id) on delete set null, created_at timestamptz not null default now(),
  foreign key (application_id, institution_id) references public.applications (id, institution_id));
create index documents_app_idx on public.documents (application_id);
create index documents_expiry_idx on public.documents (expiry_date);

-- ---------- compliance ----------
create sequence public.compliance_ref_seq start 1;
create table public.compliance_requirements (
  id uuid primary key default gen_random_uuid(), reference text not null unique default ('CMP-' || lpad(nextval('public.compliance_ref_seq')::text, 3, '0')),
  application_id uuid not null references public.applications (id), title text not null check (btrim(title) <> ''), description text,
  due_at timestamptz not null, state text not null default 'NOT_SUBMITTED' check (state in ('NOT_SUBMITTED', 'SUBMITTED', 'VERIFIED', 'REJECTED')),
  verifier_id uuid references public.profiles (id) on delete set null, created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (id, application_id));
create index compliance_app_idx on public.compliance_requirements (application_id);
create index compliance_due_open_idx on public.compliance_requirements (due_at) where state in ('NOT_SUBMITTED', 'REJECTED');

create table public.evidence_submissions (
  id uuid primary key default gen_random_uuid(), compliance_id uuid not null, application_id uuid not null,
  file_name text not null check (btrim(file_name) <> ''), storage_path text, file_size bigint not null check (file_size >= 0 and file_size <= 5242880), note text,
  decision text not null default 'PENDING' check (decision in ('PENDING', 'VERIFIED', 'REJECTED')),
  submitted_by uuid references public.profiles (id) on delete set null, created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null, reviewed_at timestamptz, review_remarks text,
  check (decision <> 'REJECTED' or btrim(coalesce(review_remarks, '')) <> ''),
  foreign key (compliance_id, application_id) references public.compliance_requirements (id, application_id));
create index evidence_compliance_idx on public.evidence_submissions (compliance_id, created_at);

-- ---------- EVC ----------
create sequence public.evc_ref_seq start 1;
create table public.evc_visits (
  id uuid primary key default gen_random_uuid(), reference text not null unique default ('EVC-' || lpad(nextval('public.evc_ref_seq')::text, 3, '0')),
  application_id uuid not null references public.applications (id), status text not null default 'SCHEDULED' check (status in ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  scheduled_for timestamptz not null, report_status text not null default 'NOT_DUE' check (report_status in ('NOT_DUE', 'PENDING', 'SUBMITTED', 'REVIEWED')),
  cancel_reason text, scheduled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (id, application_id),
  check (status <> 'CANCELLED' or btrim(coalesce(cancel_reason, '')) <> ''));
create unique index evc_one_active_visit_idx on public.evc_visits (application_id) where status <> 'CANCELLED';
create index evc_visits_when_idx on public.evc_visits (scheduled_for);
create table public.evc_assignments (
  visit_id uuid not null, application_id uuid not null, member_id uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(), primary key (visit_id, member_id),
  foreign key (visit_id, application_id) references public.evc_visits (id, application_id));
create index evc_assignments_member_idx on public.evc_assignments (member_id);
create index evc_assignments_app_idx on public.evc_assignments (application_id);
create table public.evc_reports (
  id uuid primary key default gen_random_uuid(), visit_id uuid not null unique, application_id uuid not null,
  observations text not null check (length(btrim(observations)) >= 10), recommendation text not null check (length(btrim(recommendation)) >= 10),
  submitted_by uuid references public.profiles (id) on delete set null, submitted_at timestamptz not null default now(),
  review_note text, reviewed_by uuid references public.profiles (id) on delete set null, reviewed_at timestamptz,
  foreign key (visit_id, application_id) references public.evc_visits (id, application_id));

-- ---------- escalations, notifications, audit ----------
create table public.escalations (
  id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications (id),
  level smallint not null check (level between 1 and 4), status text not null default 'OPEN' check (status in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  reason text not null, opened_at timestamptz not null default now(),
  acknowledged_by uuid references public.profiles (id) on delete set null, acknowledged_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null, resolved_at timestamptz, resolution_remarks text,
  check (status <> 'RESOLVED' or btrim(coalesce(resolution_remarks, '')) <> ''));
create unique index escalations_one_unresolved_idx on public.escalations (application_id) where status <> 'RESOLVED';
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null, body text, severity text not null default 'INFO' check (severity in ('INFO', 'WARNING', 'CRITICAL')),
  application_id uuid references public.applications (id), created_at timestamptz not null default now(), read_at timestamptz);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create table public.audit_events (
  id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),
  actor_id uuid, actor_role text, action text not null, application_id uuid references public.applications (id),
  target_type text, target_ref text, from_value text, to_value text, remarks text, is_seed boolean not null default false);
create index audit_occurred_idx on public.audit_events (occurred_at desc);
create index audit_app_idx on public.audit_events (application_id, occurred_at desc);
create index audit_actor_idx on public.audit_events (actor_id);

-- ---------- generic updated_at ----------
create function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger touch_profiles before update on public.profiles for each row execute function public.touch_updated_at();
create trigger touch_applications before update on public.applications for each row execute function public.touch_updated_at();
create trigger touch_compliance before update on public.compliance_requirements for each row execute function public.touch_updated_at();
create trigger touch_evc_visits before update on public.evc_visits for each row execute function public.touch_updated_at();
create trigger touch_app_settings before update on public.app_settings for each row execute function public.touch_updated_at();

-- ---------- reference data (DEMO timelines; replace once official AICTE rules are verified) ----------
insert into public.regions values ('SOUTHERN', 'Southern'), ('WESTERN', 'Western'), ('EASTERN', 'Eastern'), ('NORTHERN', 'Northern'), ('CENTRAL', 'Central');
insert into public.workflow_stage_config (stage, ordinal, sla_days, is_terminal, note) values
  ('DRAFT', 0, null, false, 'Not yet submitted'), ('SUBMITTED', 1, 3, false, 'Demo SLA'), ('SCRUTINY', 2, 10, false, 'Demo SLA'), ('RESUBMISSION_REQUIRED', 3, 7, false, 'Demo SLA'),
  ('EVC_REQUIRED', 4, 5, false, 'Demo SLA'), ('EVC_SCHEDULED', 5, 14, false, 'Demo SLA'), ('COMMITTEE_REVIEW', 6, 10, false, 'Demo SLA'), ('FINAL_REVIEW', 7, 7, false, 'Demo SLA'),
  ('APPROVED', 8, null, true, 'Terminal'), ('REJECTED', 9, null, true, 'Terminal');
insert into public.workflow_actions values
  ('start', 'scrutiny', 'Start scrutiny', 'SUBMITTED', 'SCRUTINY'), ('raise', 'scrutiny', 'Raise observation', 'SCRUTINY', 'RESUBMISSION_REQUIRED'),
  ('complete', 'scrutiny', 'Mark scrutiny complete', 'SCRUTINY', 'EVC_REQUIRED'), ('respond', 'institution', 'Submit response to observations', 'RESUBMISSION_REQUIRED', 'SCRUTINY'),
  ('forward', 'regional', 'Forward to final review', 'COMMITTEE_REVIEW', 'FINAL_REVIEW'), ('approve', 'admin', 'Record approval decision', 'FINAL_REVIEW', 'APPROVED'),
  ('reject', 'admin', 'Record rejection decision', 'FINAL_REVIEW', 'REJECTED');
insert into public.app_settings (key, value, note) values
  ('at_risk_days', '2', 'Demo: remaining days at or below this are AT_RISK'),
  ('doc_alert_steps', '[[7,"CRITICAL"],[15,"WARNING"],[30,"INFO"]]', 'Demo document-expiry warning tiers (days, severity)'),
  ('risk_weights', '{"overdue":40,"atRisk":20,"leaseExpired":25,"leaseExpiring":10,"perObservation":10,"complianceOverdue":25}', 'Demo risk weights'),
  ('escalation_steps', '[[10,4],[7,3],[4,2],[1,1]]', 'Demo: [days overdue at least, escalation level]'),
  ('evidence_max_bytes', '5242880', 'Demo upload limit');

create function public.escalation_level_for(p_days int) returns int language sql stable as $$
  select coalesce(max((s ->> 1)::int) filter (where p_days >= (s ->> 0)::int), 0) from jsonb_array_elements((select value from public.app_settings where key = 'escalation_steps')) s $$;

-- SLA view: RLS of the caller applies (security_invoker).
create view public.application_sla with (security_invoker = true) as
select a.id, a.reference, a.stage, d.days_in_stage, c.sla_days, c.sla_days - d.days_in_stage as remaining_days,
  case when c.is_terminal then 'DONE' when c.sla_days is null then 'N/A' when c.sla_days - d.days_in_stage < 0 then 'OVERDUE'
       when c.sla_days - d.days_in_stage <= (select (value #>> '{}')::int from public.app_settings where key = 'at_risk_days') then 'AT_RISK' else 'ON_TRACK' end as sla_status
from public.applications a join public.workflow_stage_config c on c.stage = a.stage
cross join lateral (select floor(extract(epoch from now() - a.stage_started_at) / 86400)::int as days_in_stage) d;
