insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('sources', 'sources', false, 26214400, array['application/pdf']),
       ('assets', 'assets', false, 10485760, array['image/png','image/jpeg','image/webp']),
       ('exports', 'exports', false, 52428800, array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Storage objects already have RLS enabled by Supabase. Reserve source metadata
-- server-side before issuing an upload URL. No overwrite or browser deletion grants.
create policy thesisdesk_source_read on storage.objects for select to authenticated
using (bucket_id = 'sources' and exists (
  select 1 from public.sources s where s.storage_path = name and s.deleted_at is null
    and private.owns_project(s.project_id)
));
create policy thesisdesk_source_upload on storage.objects for insert to authenticated
with check (bucket_id = 'sources' and exists (
  select 1 from public.sources s where s.storage_path = name and s.status = 'uploaded'
    and s.deleted_at is null and private.owns_project(s.project_id)
));
-- Assets/exports are intentionally deny-by-default until their metadata and lifecycle
-- are implemented; private buckets alone must never imply authenticated-wide access.
