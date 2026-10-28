-- Private storage bucket for documents and compliance evidence. Requires Supabase (the storage schema).
-- Object path convention: <institution_id>/<application_id>/<unique-file-name>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nexus-documents', 'nexus-documents', false, 5242880, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

create function public.storage_object_app(p_name text) returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(p_name, '/', 2)::uuid end $$;
create function public.storage_object_visible(p_name text) returns boolean language sql stable security definer set search_path = '' as
  $$ select coalesce(public.app_visible(public.storage_object_app(p_name)), false) $$;
create function public.storage_object_uploadable(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_role_name() = 'institution' and split_part(p_name, '/', 1) = public.my_institution()::text and coalesce(public.app_visible(public.storage_object_app(p_name)), false) $$;
revoke all on function public.storage_object_app(text), public.storage_object_visible(text), public.storage_object_uploadable(text) from public, anon;
grant execute on function public.storage_object_app(text), public.storage_object_visible(text), public.storage_object_uploadable(text) to authenticated;

-- No update or delete policies on purpose: objects are write-once from the client.
create policy nexus_docs_read on storage.objects for select to authenticated using (bucket_id = 'nexus-documents' and public.storage_object_visible(name));
create policy nexus_docs_upload on storage.objects for insert to authenticated with check (bucket_id = 'nexus-documents' and public.storage_object_uploadable(name));
