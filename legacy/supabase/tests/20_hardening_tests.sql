-- LOCAL VALIDATION of migration 6. Each block reproduces a vulnerability found by the audit and proves it is now rejected.
-- Runs after 10_security_tests.sql. Uses the stubbed storage.objects table to exercise the real storage policies.
\set ON_ERROR_STOP on
grant usage on schema storage to authenticated;
grant select, insert on storage.objects to authenticated;
\echo == 1. compliance cannot be verified directly ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-regional-0')::uuid::text, false); set role authenticated;
select tests.denied_like('regional cannot set compliance state', $q$ update public.compliance_requirements set state = 'VERIFIED' where reference = 'CMP-002' $q$, '%permission denied%');
select tests.denied_like('regional cannot create a pre-verified record', $q$ insert into public.compliance_requirements (application_id, title, due_at, state) values (md5('nexus-demo-app-10')::uuid, 'x', now(), 'VERIFIED') $q$, '%row-level security%');
select tests.rows('regional can still edit the due date (legitimate)', $q$ update public.compliance_requirements set due_at = due_at + interval '2 days' where reference = 'CMP-002' $q$, 1);
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-admin-0')::uuid::text, false); set role authenticated;
select tests.denied_like('admin cannot set compliance state directly either', $q$ update public.compliance_requirements set state = 'VERIFIED' where reference = 'CMP-002' $q$, '%permission denied%');
reset role;
select tests.eq('record state untouched by the attempts', (select state from public.compliance_requirements where reference = 'CMP-002'), 'NOT_SUBMITTED');
\echo == 1b. legitimate evidence flow still works ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-institution-0')::uuid::text, false); set role authenticated;
select tests.ok('institution submits evidence with a valid path', $q$ select public.submit_evidence(md5('nexus-demo-cmp-1')::uuid, 'proof.pdf', md5('nexus-demo-inst-0')::uuid::text || '/' || md5('nexus-demo-app-10')::uuid::text || '/proof.pdf', 1000, 'faculty list') $q$);
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-regional-0')::uuid::text, false); set role authenticated;
select tests.denied_like('still cannot shortcut once evidence is submitted', $q$ update public.compliance_requirements set state = 'VERIFIED' where reference = 'CMP-002' $q$, '%permission denied%');
select tests.ok('regional verifies through the review function', $q$ select public.review_evidence((select id from public.evidence_submissions where compliance_id = md5('nexus-demo-cmp-1')::uuid and decision = 'PENDING'), 'VERIFIED', 'ok') $q$);
select tests.eq('state is now VERIFIED', (select state from public.compliance_requirements where reference = 'CMP-002'), 'VERIFIED');
reset role;
select tests.eq('verification stayed audited with actor role', (select count(*) from public.audit_events where target_ref = 'CMP-002' and to_value = 'VERIFIED' and actor_role = 'regional')::text, '1');
\echo == 2. documents: only the verification field is updatable ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-scrutiny-0')::uuid::text, false); set role authenticated;
select tests.denied_like('scrutiny cannot change expiry date', $q$ update public.documents set expiry_date = expiry_date + 3650 where application_id = md5('nexus-demo-app-0')::uuid and doc_type = 'LEASE' $q$, '%permission denied%');
select tests.denied_like('scrutiny cannot change file or storage path', $q$ update public.documents set storage_path = 'x' where application_id = md5('nexus-demo-app-0')::uuid $q$, '%permission denied%');
select tests.rows('scrutiny can record a verification outcome (legitimate)', $q$ update public.documents set verification_status = 'REJECTED' where application_id = md5('nexus-demo-app-0')::uuid and doc_type = 'LEASE' $q$, 1);
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-regional-0')::uuid::text, false); set role authenticated;
select tests.denied_like('regional cannot change expiry date', $q$ update public.documents set expiry_date = current_date + 9999 $q$, '%permission denied%');
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-institution-0')::uuid::text, false); set role authenticated;
select tests.denied_like('institution cannot change expiry date', $q$ update public.documents set expiry_date = current_date + 9999 $q$, '%permission denied%');
select tests.rows('institution cannot self-verify (RLS hides rows)', $q$ update public.documents set verification_status = 'VERIFIED' $q$, 0);
reset role;
select tests.eq('lease expiry untouched', (select (expiry_date = current_date - 8)::text from public.documents where application_id = md5('nexus-demo-app-0')::uuid and doc_type = 'LEASE'), 'true');
\echo == 3. storage paths are bound to institution + application ==
insert into public.compliance_requirements (application_id, title, due_at) values (md5('nexus-demo-app-20')::uuid, 'Hardening test requirement', now() + interval '10 days');
select set_config('request.jwt.claim.sub', md5('nexus-demo-institution-0')::uuid::text, false); set role authenticated;
select tests.denied_like('document pointing at another institution path', $q$ insert into public.documents (application_id, institution_id, doc_type, uploaded_by, storage_path) values (md5('nexus-demo-app-0')::uuid, md5('nexus-demo-inst-0')::uuid, 'NOC', auth.uid(), md5('nexus-demo-inst-5')::uuid::text || '/' || md5('nexus-demo-app-5')::uuid::text || '/secret.pdf') $q$, '%check constraint%');
select tests.denied_like('own institution but another application in the path', $q$ insert into public.documents (application_id, institution_id, doc_type, uploaded_by, storage_path) values (md5('nexus-demo-app-0')::uuid, md5('nexus-demo-inst-0')::uuid, 'NOC', auth.uid(), md5('nexus-demo-inst-0')::uuid::text || '/' || md5('nexus-demo-app-10')::uuid::text || '/a.pdf') $q$, '%check constraint%');
select tests.denied_like('path traversal rejected', $q$ insert into public.documents (application_id, institution_id, doc_type, uploaded_by, storage_path) values (md5('nexus-demo-app-0')::uuid, md5('nexus-demo-inst-0')::uuid, 'NOC', auth.uid(), md5('nexus-demo-inst-0')::uuid::text || '/' || md5('nexus-demo-app-0')::uuid::text || '/../x.pdf') $q$, '%check constraint%');
select tests.ok('own path is accepted (legitimate)', $q$ insert into public.documents (application_id, institution_id, doc_type, uploaded_by, storage_path) values (md5('nexus-demo-app-0')::uuid, md5('nexus-demo-inst-0')::uuid, 'CERTIFICATE', auth.uid(), md5('nexus-demo-inst-0')::uuid::text || '/' || md5('nexus-demo-app-0')::uuid::text || '/cert.pdf') $q$);
select tests.denied_like('evidence with a foreign path is rejected', $q$ select public.submit_evidence((select id from public.compliance_requirements where title = 'Hardening test requirement'), 'p.pdf', md5('nexus-demo-inst-5')::uuid::text || '/' || md5('nexus-demo-app-5')::uuid::text || '/p.pdf', 10, null) $q$, '%storage_path must be%');
select tests.ok('storage upload to own folder and application', $q$ insert into storage.objects (bucket_id, name) values ('nexus-documents', md5('nexus-demo-inst-0')::uuid::text || '/' || md5('nexus-demo-app-0')::uuid::text || '/a.pdf') $q$);
select tests.denied_like('storage upload into another institution folder', $q$ insert into storage.objects (bucket_id, name) values ('nexus-documents', md5('nexus-demo-inst-5')::uuid::text || '/' || md5('nexus-demo-app-5')::uuid::text || '/a.pdf') $q$, '%row-level security%');
select tests.denied_like('storage upload to own folder but foreign application', $q$ insert into storage.objects (bucket_id, name) values ('nexus-documents', md5('nexus-demo-inst-0')::uuid::text || '/' || md5('nexus-demo-app-5')::uuid::text || '/a.pdf') $q$, '%row-level security%');
select tests.denied_like('storage upload with nested folders', $q$ insert into storage.objects (bucket_id, name) values ('nexus-documents', md5('nexus-demo-inst-0')::uuid::text || '/' || md5('nexus-demo-app-0')::uuid::text || '/x/a.pdf') $q$, '%row-level security%');
select tests.denied_like('storage upload with traversal', $q$ insert into storage.objects (bucket_id, name) values ('nexus-documents', md5('nexus-demo-inst-0')::uuid::text || '/' || md5('nexus-demo-app-0')::uuid::text || '/..') $q$, '%row-level security%');
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-institution-1')::uuid::text, false); set role authenticated;
select tests.eq('another institution cannot see the object', (select count(*) from storage.objects)::text, '0');
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-regional-0')::uuid::text, false); set role authenticated;
select tests.eq('authorised regional officer can see it', (select count(*) from storage.objects)::text, '1');
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-evc-5')::uuid::text, false); set role authenticated;
select tests.eq('unassigned EVC member cannot see it', (select count(*) from storage.objects)::text, '0');
reset role;
\echo == 4. profile reads are least-privilege ==
select tests.eq('staff_directory exposes only id, full_name, role', (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'staff_directory'), 'id,full_name,role');
select set_config('request.jwt.claim.sub', md5('nexus-demo-regional-0')::uuid::text, false); set role authenticated;
select tests.eq('regional reads only its own profile row', (select count(*) from public.profiles)::text, '1');
select tests.eq('regional cannot read institution profiles', (select count(*) from public.profiles where role = 'institution')::text, '0');
select tests.eq('regional still gets staff names (directory, 20 active staff)', (select count(*) from public.staff_directory)::text, '20');
select tests.eq('directory never lists institution users', (select count(*) from public.staff_directory where role = 'institution')::text, '0');
select tests.eq('officer names still resolve in the overview', (select count(*) from public.application_overview where assigned_officer is not null and officer_name is null)::text, '0');
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-evc-0')::uuid::text, false); set role authenticated;
select tests.eq('EVC member cannot read institution profiles', (select count(*) from public.profiles where role = 'institution')::text, '0');
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-scrutiny-0')::uuid::text, false); set role authenticated;
select tests.eq('scrutiny officer cannot read other profiles', (select count(*) from public.profiles)::text, '1');
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-institution-0')::uuid::text, false); set role authenticated;
select tests.eq('institution gets an empty staff directory', (select count(*) from public.staff_directory)::text, '0');
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-admin-0')::uuid::text, false); set role authenticated;
select tests.eq('admin can still read every profile', (select count(*) from public.profiles)::text, '30');
reset role;
\echo == 5. institutions do not see staff remarks or identities ==
select set_config('request.jwt.claim.sub', md5('nexus-demo-regional-1')::uuid::text, false); set role authenticated;
select tests.ok('regional forwards an application with an internal remark', $q$ select public.transition_application(md5('nexus-demo-app-21')::uuid, 'forward', 'internal: needs a second look') $q$);
select tests.eq('regional sees its remark in the audit view', (select count(*) from public.audit_trail where application_id = md5('nexus-demo-app-21')::uuid and remarks = 'internal: needs a second look')::text, '1');
select tests.eq('regional sees its remark in the timeline view', (select count(*) from public.stage_timeline where application_id = md5('nexus-demo-app-21')::uuid and remarks = 'internal: needs a second look')::text, '1');
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-institution-1')::uuid::text, false); set role authenticated;
select tests.eq('institution cannot read the audit table directly', (select count(*) from public.audit_events)::text, '0');
select tests.eq('institution cannot read the history table directly', (select count(*) from public.application_stage_history)::text, '0');
select tests.eq('institution still sees its application events', (select (count(*) > 0)::text from public.audit_trail where application_id = md5('nexus-demo-app-21')::uuid), 'true');
select tests.eq('staff remark is masked in the audit view', (select count(*) from public.audit_trail where remarks = 'internal: needs a second look')::text, '0');
select tests.eq('no staff-written remark or id reaches the institution', (select count(*) from public.audit_trail where actor_role is distinct from 'institution' and (remarks is not null or actor_id is not null))::text, '0');
select tests.eq('staff remark is masked in the timeline view', (select count(*) from public.stage_timeline where remarks = 'internal: needs a second look')::text, '0');
select tests.eq('the stage change itself is still visible', (select count(*) from public.stage_timeline where application_id = md5('nexus-demo-app-21')::uuid and to_stage = 'FINAL_REVIEW')::text, '1');
select tests.eq('escalation activity is hidden from institutions', (select count(*) from public.audit_trail where target_type = 'escalations')::text, '0');
reset role;
select set_config('request.jwt.claim.sub', md5('nexus-demo-admin-0')::uuid::text, false); set role authenticated;
select tests.eq('admin sees remarks and actors unmasked', (select count(*) from public.audit_trail where remarks = 'internal: needs a second look' and actor_id is not null)::text, '1');
reset role;
\echo ALL HARDENING TESTS PASSED
