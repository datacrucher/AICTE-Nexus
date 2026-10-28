-- LOCAL VALIDATION: run after migrations, seed and 01_test_helpers.sql. Raises on the first failed expectation.
\set ON_ERROR_STOP on
\echo == anonymous ==
set role anon;
select tests.denied('anon cannot read applications', 'select count(*) from public.applications');
reset role;
\echo == institution 0 ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-institution-0')::uuid::text, false); set role authenticated;
select tests.eq('institution 0 sees only its 3 applications', (select count(*) from public.applications)::text, '3');
select tests.eq('no foreign-institution application visible', (select count(*) from public.applications where institution_id <> public.my_institution())::text, '0');
select tests.eq('sees only own compliance (3)', (select count(*) from public.compliance_requirements)::text, '3');
select tests.eq('SLA view respects RLS', (select count(*) from public.application_sla)::text, '3');
select tests.eq('sees only own institution row', (select count(*) from public.institutions)::text, '1');
select tests.eq('reads only its notification', (select count(*) from public.notifications)::text, '1');
select tests.eq('cannot see escalations', (select count(*) from public.escalations)::text, '0');
select tests.denied('cannot promote itself to admin', $q$ update public.profiles set role = 'admin' where id = auth.uid() $q$);
select tests.denied('cannot change own institution', $q$ update public.profiles set institution_id = md5('nexus-demo-inst-5')::uuid where id = auth.uid() $q$);
select tests.rows('can rename itself', $q$ update public.profiles set full_name = 'Registrar (renamed)' where id = auth.uid() $q$, 1);
select tests.rows('cannot rename another profile', $q$ update public.profiles set full_name = 'x' where id <> auth.uid() $q$, 0);
select tests.denied('cannot insert profiles', $q$ insert into public.profiles (id, full_name, role) values (gen_random_uuid(), 'x', 'admin') $q$);
select tests.denied('cannot update applications directly', $q$ update public.applications set stage = 'APPROVED' $q$);
select tests.denied('cannot write audit events', $q$ insert into public.audit_events (action) values ('forged') $q$);
select tests.denied('cannot delete audit events', $q$ delete from public.audit_events $q$);
select tests.rows('cannot change config', $q$ update public.app_settings set value = '99' $q$, 0);
select tests.denied_like('cannot create application for another institution', $q$ insert into public.applications (institution_id, application_type, stage) values (md5('nexus-demo-inst-5')::uuid, 'New Course', 'SUBMITTED') $q$, '%row-level security%');
select tests.ok('can create application for own institution', $q$ insert into public.applications (reference, institution_id, application_type, stage) values ('HACK-1', md5('nexus-demo-inst-0')::uuid, 'New Course', 'SUBMITTED') $q$);
select tests.ok('can create application without supplying a reference', $q$ insert into public.applications (institution_id, application_type, stage) values (md5('nexus-demo-inst-0')::uuid, 'New Institution', 'SUBMITTED') $q$);
select tests.eq('client-supplied reference is ignored; server references used', (select count(*) from public.applications where reference ~ '^AICTE-[0-9]{4}-20[0-9]{2}$' and reference not like 'HACK%')::text, '2');
select tests.eq('no HACK reference stored', (select count(*) from public.applications where reference like 'HACK%')::text, '0');
select tests.eq('creation wrote history rows atomically', (select count(*) from public.stage_timeline where from_stage is null and changed_by = auth.uid())::text, '2');
select tests.eq('creation wrote audit rows atomically', (select count(*) from public.audit_trail where action = 'Application created' and actor_id = auth.uid())::text, '2');
select tests.denied('client cannot self-verify a document', $q$ insert into public.documents (application_id, institution_id, doc_type, verification_status, uploaded_by) values (md5('nexus-demo-app-0')::uuid, md5('nexus-demo-inst-0')::uuid, 'NOC', 'VERIFIED', auth.uid()) $q$);
select tests.ok('institution uploads a document record', $q$ insert into public.documents (application_id, institution_id, doc_type, expiry_date, uploaded_by, created_at) values (md5('nexus-demo-app-0')::uuid, md5('nexus-demo-inst-0')::uuid, 'NOC', current_date + 30, auth.uid(), '2000-01-01') $q$);
select tests.eq('client cannot backdate created_at', (select count(*) from public.documents where created_at < now() - interval '1 hour')::text, '0');
select tests.eq('document upload was audited', (select count(*) from public.audit_trail where target_type = 'documents' and actor_id = auth.uid())::text, '1');
select tests.denied('cannot upload a document for another institution app', $q$ insert into public.documents (application_id, institution_id, doc_type, uploaded_by) values (md5('nexus-demo-app-1')::uuid, md5('nexus-demo-inst-1')::uuid, 'NOC', auth.uid()) $q$);
select tests.ok('submits evidence for own requirement', $q$ select public.submit_evidence(md5('nexus-demo-cmp-0')::uuid, 'proof.pdf', null, 1000, 'faculty list') $q$);
select tests.eq('requirement now SUBMITTED', (select state from public.compliance_requirements where id = md5('nexus-demo-cmp-0')::uuid), 'SUBMITTED');
select tests.denied('cannot submit evidence twice', $q$ select public.submit_evidence(md5('nexus-demo-cmp-0')::uuid, 'again.pdf', null, 10, null) $q$);
select tests.denied('oversize file rejected', $q$ select public.submit_evidence(md5('nexus-demo-cmp-1')::uuid, 'big.pdf', null, 9999999, null) $q$);
select tests.denied('cannot review evidence', $q$ select public.review_evidence((select id from public.evidence_submissions limit 1), 'VERIFIED', null) $q$);
select tests.denied('cannot approve applications', $q$ select public.transition_application(md5('nexus-demo-app-0')::uuid, 'approve', null) $q$);
reset role;
\echo == institution 1 (other tenant) ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-institution-1')::uuid::text, false); set role authenticated;
select tests.denied('cannot submit evidence for another institution', $q$ select public.submit_evidence(md5('nexus-demo-cmp-2')::uuid, 'x.pdf', null, 10, null) $q$);
select tests.eq('cannot see institution 0 evidence', (select count(*) from public.evidence_submissions where compliance_id = md5('nexus-demo-cmp-0')::uuid)::text, '0');
reset role;
\echo == regional 0 (Southern) ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-regional-0')::uuid::text, false); set role authenticated;
select tests.eq('sees only Southern applications (6 seeded + 2 created above)', (select count(*) from public.applications)::text, '8');
select tests.eq('no other-region application', (select count(*) from public.applications where region_code <> 'SOUTHERN')::text, '0');
select tests.denied('reject needs remarks', $q$ select public.review_evidence((select id from public.evidence_submissions where compliance_id = md5('nexus-demo-cmp-0')::uuid and decision = 'PENDING'), 'REJECTED', '') $q$);
select tests.ok('verifies evidence', $q$ select public.review_evidence((select id from public.evidence_submissions where compliance_id = md5('nexus-demo-cmp-0')::uuid and decision = 'PENDING'), 'VERIFIED', 'ok') $q$);
select tests.eq('requirement VERIFIED', (select state from public.compliance_requirements where id = md5('nexus-demo-cmp-0')::uuid), 'VERIFIED');
select tests.denied('cannot review already-reviewed evidence', $q$ select public.review_evidence((select id from public.evidence_submissions where compliance_id = md5('nexus-demo-cmp-0')::uuid limit 1), 'VERIFIED', null) $q$);
select tests.denied('cannot resolve escalations', $q$ select public.act_on_escalation((select id from public.escalations limit 1), 'resolve', 'x') $q$);
reset role;
\echo == regional 1 (Western) cannot review Southern evidence ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-regional-1')::uuid::text, false); set role authenticated;
select tests.denied('other region reviewer blocked', $q$ select public.review_evidence((select id from public.evidence_submissions where compliance_id = md5('nexus-demo-cmp-2')::uuid), 'VERIFIED', null) $q$);
reset role;
\echo == scrutiny 3 workflow ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-scrutiny-3')::uuid::text, false); set role authenticated;
select tests.eq('sees only assigned applications', (select count(*) from public.applications where assigned_officer <> auth.uid())::text, '0');
select tests.denied('cannot complete from SUBMITTED', $q$ select public.transition_application(md5('nexus-demo-app-3')::uuid, 'complete', null) $q$);
select tests.ok('starts scrutiny', $q$ select public.transition_application(md5('nexus-demo-app-3')::uuid, 'start', 'beginning review') $q$);
select tests.ok('raises observation', $q$ select public.transition_application(md5('nexus-demo-app-3')::uuid, 'raise', 'NOC copy missing') $q$);
select tests.eq('observation recorded', (select count(*) from public.observations where application_id = md5('nexus-demo-app-3')::uuid and status = 'OPEN')::text, '1');
select tests.denied('cannot touch unassigned application', $q$ select public.transition_application(md5('nexus-demo-app-4')::uuid, 'start', null) $q$);
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-institution-3')::uuid::text, false); set role authenticated;
select tests.ok('institution responds', $q$ select public.transition_application(md5('nexus-demo-app-3')::uuid, 'respond', 'NOC attached') $q$);
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-scrutiny-3')::uuid::text, false); set role authenticated;
select tests.ok('completes scrutiny', $q$ select public.transition_application(md5('nexus-demo-app-3')::uuid, 'complete', null) $q$);
select tests.eq('stage is EVC_REQUIRED', (select stage from public.applications where id = md5('nexus-demo-app-3')::uuid), 'EVC_REQUIRED');
select tests.eq('history rows written by trigger (start, raise, respond, complete)', (select count(*) from public.application_stage_history where application_id = md5('nexus-demo-app-3')::uuid and remarks is distinct from 'Seeded demo event')::text, '4');
select tests.eq('audit rows carry actor role + remarks', (select count(*) from public.audit_events where application_id = md5('nexus-demo-app-3')::uuid and action = 'Stage changed' and actor_role = 'scrutiny' and remarks = 'NOC copy missing')::text, '1');
reset role;
\echo == EVC member 0 ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-evc-0')::uuid::text, false); set role authenticated;
select tests.eq('sees only assigned visits', (select count(*) from public.evc_visits)::text, '2');
select tests.eq('sees only assigned applications', (select count(*) from public.applications)::text, '2');
select tests.denied('cannot edit visits directly', $q$ update public.evc_visits set status = 'COMPLETED' $q$);
reset role;
\echo == admin ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-admin-0')::uuid::text, false); set role authenticated;
select tests.eq('admin sees all applications', (select count(*) from public.applications)::text, '32');
select tests.ok('admin acknowledges escalation', $q$ select public.act_on_escalation((select id from public.escalations where status = 'OPEN' limit 1), 'acknowledge', 'noted') $q$);
select tests.denied('resolve needs remarks', $q$ select public.act_on_escalation((select id from public.escalations where status = 'ACKNOWLEDGED' limit 1), 'resolve', '') $q$);
select tests.ok('admin resolves escalation', $q$ select public.act_on_escalation((select id from public.escalations where status = 'ACKNOWLEDGED' limit 1), 'resolve', 'handled') $q$);
select tests.rows('admin can change config', $q$ update public.app_settings set value = '3' where key = 'at_risk_days' $q$, 1);
select tests.rows('admin can change a role', $q$ update public.profiles set is_active = true where id = md5('nexus-demo-evc-5')::uuid $q$, 1);
select tests.eq('audit trail visible to admin', (select (count(*) > 50)::text from public.audit_events), 'true');
reset role;
\echo == audit immutability (database owner) ==
select tests.denied('owner cannot update audit', $q$ update public.audit_events set remarks = 'tamper' $q$);
select tests.denied('owner cannot delete audit', $q$ delete from public.audit_events $q$);
select tests.denied('owner cannot truncate audit', $q$ truncate public.audit_events $q$);
\echo == config / integrity ==
select tests.eq('30 demo profiles seeded', (select count(*) from public.profiles)::text, '30');
select tests.eq('30 seeded applications + 2 created in test', (select count(*) from public.applications)::text, '32');
select tests.denied('one active EVC visit per application', $q$ insert into public.evc_visits (application_id, scheduled_for) values (md5('nexus-demo-app-7')::uuid, now() + interval '1 day') $q$);
select tests.denied('EVC assignee must be committee role', $q$ insert into public.evc_assignments (visit_id, application_id, member_id) values (md5('nexus-demo-evc-visit-1')::uuid, md5('nexus-demo-app-7')::uuid, md5('nexus-demo-admin-0')::uuid) $q$);
\echo ALL SECURITY TESTS PASSED
