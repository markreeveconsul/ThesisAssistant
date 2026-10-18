-- Authenticated source ingestion through owner-checked RPCs and private Storage.
alter table public.sources
  add column sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  add column format text not null default 'pdf' check (format in ('pdf','docx','txt')),
  add column warning text;
alter table public.sources drop constraint if exists sources_page_count_check;
alter table public.sources add constraint sources_page_count_check
  check (page_count between 1 and 10000);
create unique index sources_project_sha256_idx
  on public.sources(project_id, sha256) where sha256 is not null;
alter table public.source_pages
  add column locator_type text not null default 'page'
  check (locator_type in ('page','paragraph','line'));

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]
where id = 'sources';

create policy thesisdesk_source_delete on storage.objects for delete to authenticated
using (bucket_id = 'sources' and exists (
  select 1 from public.sources s
  where s.storage_path = name and s.deleted_at is null
    and private.owns_project(s.project_id)
));

-- Privileged ingestion logic stays in the non-exposed private schema. Public
-- PostgREST RPCs below are invoker wrappers and only delegate after auth checks.
create function private.reserve_source(
  p_project_id uuid,
  p_filename text,
  p_byte_size bigint,
  p_sha256 text,
  p_format text
)
returns table(source_id uuid, storage_path text)
language plpgsql security definer set search_path = '' as $$
declare
  current_owner_id uuid := auth.uid();
  new_source_id uuid := gen_random_uuid();
  clean_filename text;
  new_storage_path text;
begin
  if current_owner_id is null then raise exception 'Sign in to upload sources'; end if;
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = current_owner_id and p.deleted_at is null
  ) then raise exception 'Project unavailable'; end if;
  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 26214400 then
    raise exception 'Maximum file size is 25 MB';
  end if;
  if p_format is null or p_format not in ('pdf','docx','txt') then
    raise exception 'Unsupported source format';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid source checksum';
  end if;

  clean_filename := left(btrim(regexp_replace(coalesce(p_filename, ''), '[[:cntrl:]<>:"/\\|?*]', '_', 'g'), ' .'), 180);
  if clean_filename = '' or clean_filename !~* ('\.' || p_format || '$') then
    raise exception 'Invalid source filename';
  end if;
  if exists (
    select 1 from public.sources s
    where s.project_id = p_project_id and s.sha256 = p_sha256 and s.deleted_at is null
  ) then raise exception 'This file is already in this project'; end if;

  new_storage_path := current_owner_id::text || '/' || p_project_id::text || '/' || new_source_id::text || '/' || clean_filename;
  insert into public.sources(
    id, project_id, filename, storage_path, byte_size, status, sha256, format
  ) values (
    new_source_id, p_project_id, clean_filename, new_storage_path, p_byte_size, 'uploaded', p_sha256, p_format
  );
  return query select new_source_id, new_storage_path;
end;
$$;
revoke all on function private.reserve_source(uuid,text,bigint,text,text) from public, anon;
grant execute on function private.reserve_source(uuid,text,bigint,text,text) to authenticated;

create function public.reserve_source(
  p_project_id uuid,
  p_filename text,
  p_byte_size bigint,
  p_sha256 text,
  p_format text
)
returns table(source_id uuid, storage_path text)
language sql security invoker set search_path = '' as $$
  select * from private.reserve_source(p_project_id, p_filename, p_byte_size, p_sha256, p_format)
$$;
revoke all on function public.reserve_source(uuid,text,bigint,text,text) from public, anon;
grant execute on function public.reserve_source(uuid,text,bigint,text,text) to authenticated;

create function private.complete_source(p_source_id uuid, p_pages jsonb, p_warning text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  source_row public.sources%rowtype;
  page_total integer;
begin
  select s.* into source_row from public.sources s
  join public.projects p on p.id = s.project_id
  where s.id = p_source_id and p.owner_id = auth.uid()
    and p.deleted_at is null and s.deleted_at is null and s.status = 'uploaded'
  for update of s;
  if not found then raise exception 'Source upload reservation is unavailable'; end if;
  if p_pages is null or jsonb_typeof(p_pages) <> 'array' then raise exception 'Invalid extracted source pages'; end if;
  page_total := jsonb_array_length(p_pages);
  if page_total < 1 or page_total > 10000 or (source_row.format = 'pdf' and page_total > 300) then
    raise exception 'The extracted document exceeds the location limit';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_pages) item
    where jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item->'page_number') <> 'number'
      or (item->>'page_number') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(item->'text') <> 'string'
      or coalesce(item->>'locator_type','') not in ('page','paragraph','line')
  ) then raise exception 'Invalid extracted source page'; end if;
  if (select count(distinct (item->>'page_number')::integer) from jsonb_array_elements(p_pages) item) <> page_total then
    raise exception 'Duplicate source locations';
  end if;
  if (select coalesce(sum(length(item->>'text')),0) from jsonb_array_elements(p_pages) item) > 2000000 then
    raise exception 'The extracted document exceeds the text limit';
  end if;
  if source_row.format = 'pdf' and exists (
    select 1 from jsonb_array_elements(p_pages) item where item->>'locator_type' <> 'page'
  ) then raise exception 'Invalid PDF location type'; end if;
  if source_row.format = 'docx' and exists (
    select 1 from jsonb_array_elements(p_pages) item where item->>'locator_type' <> 'paragraph'
  ) then raise exception 'Invalid DOCX location type'; end if;
  if source_row.format = 'txt' and exists (
    select 1 from jsonb_array_elements(p_pages) item where item->>'locator_type' <> 'line'
  ) then raise exception 'Invalid TXT location type'; end if;
  if length(coalesce(p_warning,'')) > 500 then raise exception 'Invalid source warning'; end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id = 'sources' and o.name = source_row.storage_path
  ) then raise exception 'The uploaded file is missing from private storage'; end if;

  insert into public.source_pages(project_id, source_id, page_number, text, locator_type)
    select source_row.project_id, p_source_id, (item->>'page_number')::integer,
      item->>'text', item->>'locator_type'
    from jsonb_array_elements(p_pages) item;
  update public.sources set status = 'ready', page_count = page_total,
    warning = nullif(p_warning, '') where id = p_source_id;
end;
$$;
revoke all on function private.complete_source(uuid,jsonb,text) from public, anon;
grant execute on function private.complete_source(uuid,jsonb,text) to authenticated;

create function public.complete_source(p_source_id uuid, p_pages jsonb, p_warning text)
returns void language sql security invoker set search_path = '' as $$
  select private.complete_source(p_source_id, p_pages, p_warning)
$$;
revoke all on function public.complete_source(uuid,jsonb,text) from public, anon;
grant execute on function public.complete_source(uuid,jsonb,text) to authenticated;

create function private.cancel_source(p_source_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.sources s using public.projects p
  where s.project_id = p.id and s.id = p_source_id
    and p.owner_id = auth.uid() and p.deleted_at is null
    and s.status = 'uploaded';
end;
$$;
revoke all on function private.cancel_source(uuid) from public, anon;
grant execute on function private.cancel_source(uuid) to authenticated;

create function public.cancel_source(p_source_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.cancel_source(p_source_id)
$$;
revoke all on function public.cancel_source(uuid) from public, anon;
grant execute on function public.cancel_source(uuid) to authenticated;

create function private.delete_source(p_source_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.sources s using public.projects p
  where s.project_id = p.id and s.id = p_source_id
    and p.owner_id = auth.uid() and p.deleted_at is null
    and s.status = 'ready';
end;
$$;
revoke all on function private.delete_source(uuid) from public, anon;
grant execute on function private.delete_source(uuid) to authenticated;

create function public.delete_source(p_source_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.delete_source(p_source_id)
$$;
revoke all on function public.delete_source(uuid) from public, anon;
grant execute on function public.delete_source(uuid) to authenticated;
