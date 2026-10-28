-- AICTE Nexus FICTIONAL demo seed. Run as the database owner (SQL editor or `supabase db reset`); not for production.
-- Mirrors the frontend mock data. Dates are relative to the moment the seed runs.
-- Demo auth users have NO password. Set one for all of them with the statement in README.md (demo projects only).
begin;
select set_config('nexus.seed', 'on', true);

create temp table _inst (k int, name text);
insert into _inst values (0,'Sri Venkateswara Institute of Technology'),(1,'Narayana College of Engineering'),(2,'Deccan School of Management'),(3,'Lakeview Institute of Pharmacy'),(4,'Greenfield Polytechnic'),
 (5,'Arunodaya Institute of Technology'),(6,'Coastal School of Architecture'),(7,'Himalaya College of Engineering'),(8,'Metro Institute of Computer Applications'),(9,'Sapphire Institute of Technology');
create temp table _usr (id uuid, role text, n int, name text, inst_k int, region text);
insert into _usr select md5('nexus-demo-admin-0')::uuid, 'admin', 0, 'Dr. Meera Krishnan (demo Competent Authority)', null, null;
insert into _usr select md5('nexus-demo-regional-' || n)::uuid, 'regional', n, 'Regional Officer ' || r, null, upper(r) from unnest(array['Southern','Western','Eastern','Northern','Central']) with ordinality t(r, n0), lateral (select n0 - 1 as n) x;
insert into _usr select md5('nexus-demo-scrutiny-' || n)::uuid, 'scrutiny', n, o, null, null from unnest(array['A. Rao','P. Sharma','M. Iyer','S. Khan','R. Das','K. Nair','V. Singh','L. Reddy']) with ordinality t(o, n0), lateral (select n0 - 1 as n) x;
insert into _usr select md5('nexus-demo-evc-' || n)::uuid, 'evc', n, m, null, null from unnest(array['Dr. N. Prasad','Prof. S. Mehta','Dr. R. Banerjee','Prof. K. Joshi','Dr. T. Menon','Prof. A. Qureshi']) with ordinality t(m, n0), lateral (select n0 - 1 as n) x;
insert into _usr select md5('nexus-demo-institution-' || k)::uuid, 'institution', k, 'Registrar, ' || name, k, null from _inst;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', role || '-' || n || '@nexus-demo.invalid', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('demo', true), '', '', '', ''
from _usr;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', role || '-' || n || '@nexus-demo.invalid', 'email_verified', true), 'email', now(), now(), now() from _usr;
insert into public.institutions (id, name, region_code) select md5('nexus-demo-inst-' || k)::uuid, name, (array['SOUTHERN','WESTERN','EASTERN','NORTHERN','CENTRAL'])[(k % 5) + 1] from _inst;
insert into public.profiles (id, full_name, role, institution_id, region_code)
select id, name, role::public.app_role, case when inst_k is not null then md5('nexus-demo-inst-' || inst_k)::uuid end, region from _usr;

-- 30 applications (same generation rules as the frontend)
create temp table _app as
select i, md5('nexus-demo-app-' || i)::uuid as id,
  case i when 7 then 'EVC_SCHEDULED' when 8 then 'EVC_SCHEDULED' when 14 then 'EVC_SCHEDULED' when 21 then 'COMMITTEE_REVIEW' when 27 then 'COMMITTEE_REVIEW'
   else (array['SCRUTINY','SCRUTINY','SUBMITTED','RESUBMISSION_REQUIRED','EVC_REQUIRED','EVC_SCHEDULED','COMMITTEE_REVIEW','APPROVED','FINAL_REVIEW','SCRUTINY'])[((3 * i + i % 4) % 10) + 1] end as stage,
  case i when 7 then 3 when 8 then 6 when 14 then 1 when 21 then 2 when 27 then 4 else (i * 7) % 16 + 1 end as d
from generate_series(0, 29) i;
insert into public.applications (id, reference, institution_id, region_code, application_type, stage, stage_started_at, submitted_at, assigned_officer, priority)
select id, 'AICTE-2026-' || (1001 + i * 7), md5('nexus-demo-inst-' || (i % 10))::uuid, (array['SOUTHERN','WESTERN','EASTERN','NORTHERN','CENTRAL'])[(i % 5) + 1],
  (array['New Institution','Extension of Approval','Intake Increase','New Course'])[(i % 4) + 1], stage, now() - d * interval '1 day', now() - (d + 20 + i) * interval '1 day',
  md5('nexus-demo-scrutiny-' || (i % 8))::uuid, case when i % 5 = 0 then 'High' else 'Normal' end
from _app;

-- stage history and matching (flagged) audit events
create temp table _hist as
select id as application_id, lag(s) over (partition by id order by o) as from_stage, s as to_stage, i,
  now() - (d + (array_position(flow, stage) - o) * 4) * interval '1 day' as at
from _app, lateral unnest(array['SUBMITTED','SCRUTINY','RESUBMISSION_REQUIRED','EVC_REQUIRED','EVC_SCHEDULED','COMMITTEE_REVIEW','FINAL_REVIEW','APPROVED']) with ordinality f(s, o),
  lateral (select array['SUBMITTED','SCRUTINY','RESUBMISSION_REQUIRED','EVC_REQUIRED','EVC_SCHEDULED','COMMITTEE_REVIEW','FINAL_REVIEW','APPROVED'] as flow) fl
where o <= array_position(flow, stage);
insert into public.application_stage_history (application_id, from_stage, to_stage, changed_by, remarks, created_at)
select application_id, from_stage, to_stage, md5('nexus-demo-scrutiny-' || (i % 8))::uuid, 'Seeded demo event', at from _hist;
insert into public.audit_events (occurred_at, actor_id, actor_role, action, application_id, target_type, from_value, to_value, remarks, is_seed)
select at, md5('nexus-demo-scrutiny-' || (i % 8))::uuid, 'scrutiny', case when from_stage is null then 'Application submitted' else 'Stage changed' end, application_id, 'applications', from_stage, to_stage, 'Seeded demo event', true from _hist;

insert into public.observations (application_id, seq, body, raised_by, raised_at)
select a.id, n, (array['Faculty list incomplete','Lease agreement needs renewal evidence','Building plan approval copy missing'])[((n - 1) % 3) + 1], md5('nexus-demo-scrutiny-' || (a.i % 8))::uuid, now() - interval '3 days'
from _app a, lateral generate_series(1, a.i % 3) n where a.stage in ('SCRUTINY', 'RESUBMISSION_REQUIRED');

insert into public.documents (application_id, institution_id, doc_type, issue_date, expiry_date, verification_status, file_name)
select a.id, md5('nexus-demo-inst-' || (a.i % 10))::uuid, t.dt, (current_date + t.off) - 365, current_date + t.off, 'VERIFIED', lower(t.dt) || '-demo.pdf'
from _app a, lateral (values ('LEASE', (a.i * 13) % 60 - 8), ('NOC', 200), ('AFFILIATION', 90 + a.d + 20 + a.i)) t(dt, off);

-- compliance (same 10 records as the frontend) with evidence history
create temp table _c (k int, app_i int, title text, due_days int, state text);
insert into _c values (0,0,'Faculty recruitment undertaking',-12,'NOT_SUBMITTED'),(1,10,'Fire safety NOC renewal',5,'NOT_SUBMITTED'),(2,20,'Laboratory setup evidence',20,'SUBMITTED'),(3,1,'Library resource undertaking',-3,'REJECTED'),
 (4,6,'Building plan compliance',40,'NOT_SUBMITTED'),(5,11,'Faculty recruitment undertaking',12,'VERIFIED'),(6,3,'Lease renewal evidence',-20,'NOT_SUBMITTED'),(7,7,'Fire safety NOC renewal',8,'SUBMITTED'),
 (8,12,'Laboratory setup evidence',30,'NOT_SUBMITTED'),(9,15,'Library resource undertaking',2,'NOT_SUBMITTED');
insert into public.compliance_requirements (id, application_id, title, due_at, state, verifier_id)
select md5('nexus-demo-cmp-' || k)::uuid, md5('nexus-demo-app-' || app_i)::uuid, title, now() + due_days * interval '1 day', state, md5('nexus-demo-regional-' || (app_i % 5))::uuid from _c;
insert into public.evidence_submissions (compliance_id, application_id, file_name, file_size, note, decision, submitted_by, created_at, reviewed_by, reviewed_at, review_remarks)
select md5('nexus-demo-cmp-' || k)::uuid, md5('nexus-demo-app-' || app_i)::uuid, 'evidence-' || (k + 1) || '.pdf', 120000, 'Seeded demo submission',
  case state when 'SUBMITTED' then 'PENDING' else state end, md5('nexus-demo-institution-' || (app_i % 10))::uuid, now() - interval '5 days',
  case when state in ('VERIFIED', 'REJECTED') then md5('nexus-demo-regional-' || (app_i % 5))::uuid end, case when state in ('VERIFIED', 'REJECTED') then now() - interval '2 days' end,
  case state when 'REJECTED' then 'Evidence illegible; please resubmit' when 'VERIFIED' then 'Evidence accepted (demo)' end
from _c where state <> 'NOT_SUBMITTED';

-- EVC visits, committee assignments, reports
create temp table _v (n int, app_i int, status text, off interval, rep text, m1 int, m2 int);
insert into _v values (1,7,'SCHEDULED',interval '4 days','NOT_DUE',0,1),(2,8,'SCHEDULED',interval '-3 days','NOT_DUE',2,3),(3,14,'SCHEDULED',interval '-2 hours','NOT_DUE',4,5),(4,21,'COMPLETED',interval '-6 days','SUBMITTED',0,3),(5,27,'COMPLETED',interval '-9 days','REVIEWED',1,4);
insert into public.evc_visits (id, reference, application_id, status, scheduled_for, report_status, scheduled_by)
select md5('nexus-demo-evc-visit-' || n)::uuid, 'EVC-' || lpad(n::text, 3, '0'), md5('nexus-demo-app-' || app_i)::uuid, status, now() + off, rep, md5('nexus-demo-regional-' || (app_i % 5))::uuid from _v;
insert into public.evc_assignments (visit_id, application_id, member_id)
select md5('nexus-demo-evc-visit-' || n)::uuid, md5('nexus-demo-app-' || app_i)::uuid, md5('nexus-demo-evc-' || m)::uuid from _v, lateral (values (m1), (m2)) x(m);
insert into public.evc_reports (visit_id, application_id, observations, recommendation, submitted_by, submitted_at, review_note, reviewed_by, reviewed_at)
select md5('nexus-demo-evc-visit-' || n)::uuid, md5('nexus-demo-app-' || app_i)::uuid, 'Seeded demo observations: facilities broadly consistent with the application.', 'Seeded demo recommendation: proceed to committee review.',
  md5('nexus-demo-evc-' || m1)::uuid, now() + off + interval '1 day', case rep when 'REVIEWED' then 'Reviewed (demo)' end, case rep when 'REVIEWED' then md5('nexus-demo-regional-' || (app_i % 5))::uuid end, case rep when 'REVIEWED' then now() end
from _v where rep in ('SUBMITTED', 'REVIEWED');
select setval('public.evc_ref_seq', 5), setval('public.compliance_ref_seq', 10);
-- escalations for applications past their demo SLA
insert into public.escalations (application_id, level, reason)
select a.id, public.escalation_level_for(a.d - c.sla_days), a.stage || ' stage exceeded the demo SLA by ' || (a.d - c.sla_days) || ' day(s)'
from _app a join public.workflow_stage_config c on c.stage = a.stage where c.sla_days is not null and a.d > c.sla_days;

insert into public.notifications (user_id, title, body, severity, application_id)
select md5('nexus-demo-institution-0')::uuid, 'Compliance overdue', 'Faculty recruitment undertaking is past its demo due date.', 'CRITICAL', md5('nexus-demo-app-0')::uuid
union all select md5('nexus-demo-admin-0')::uuid, 'Escalations open', 'Several applications are past their demo SLA.', 'WARNING', null
union all select md5('nexus-demo-regional-0')::uuid, 'Evidence awaiting review', 'Laboratory setup evidence was submitted.', 'INFO', md5('nexus-demo-app-20')::uuid;
commit;
