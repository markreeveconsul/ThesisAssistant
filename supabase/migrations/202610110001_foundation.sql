-- Foundation only. Vector indexing and worker operations arrive with ingestion.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  theme text not null default 'system' check (theme in ('system','light','dark'))
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  citation_style text not null default 'apa' check (citation_style in ('apa','mla','ieee')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index projects_owner_idx on public.projects(owner_id);
alter table public.projects enable row level security;
alter table public.projects force row level security;
create policy projects_read on public.projects for select to authenticated
  using (owner_id = (select auth.uid()) and deleted_at is null);
create policy projects_create on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()) and deleted_at is null);
create policy projects_update on public.projects for update to authenticated
  using (owner_id = (select auth.uid()) and deleted_at is null)
  with check (owner_id = (select auth.uid()) and deleted_at is null);

create function private.owns_project(project uuid) returns boolean
  language sql stable security invoker set search_path = ''
  as $$ select exists(select 1 from public.projects where id = project and owner_id = (select auth.uid()) and deleted_at is null) $$;
revoke all on function private.owns_project(uuid) from public;
grant execute on function private.owns_project(uuid) to authenticated;

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  position integer not null default 0 check (position >= 0),
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb check (jsonb_typeof(content) = 'object'),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (parent_id, project_id) references public.sections(id, project_id),
  check (parent_id is distinct from id)
);
create index sections_project_idx on public.sections(project_id, position);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  filename text not null check (char_length(filename) between 1 and 255),
  storage_path text not null unique,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 26214400),
  status text not null default 'uploaded' check (status in ('uploaded','processing','ready','failed','deleting')),
  page_count integer check (page_count between 1 and 300),
  bibliographic_metadata jsonb not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, project_id)
);
create index sources_project_idx on public.sources(project_id);
create table public.source_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null,
  page_number integer not null check (page_number > 0),
  text text not null,
  text_positions jsonb not null default '[]',
  foreign key (source_id, project_id) references public.sources(id, project_id) on delete cascade,
  unique (source_id, page_number)
);
create index source_pages_project_idx on public.source_pages(project_id);
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default 'Untitled note' check (char_length(title) between 1 and 160),
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb check (jsonb_typeof(content) = 'object'),
  created_at timestamptz not null default now()
);
create index notes_project_idx on public.notes(project_id);
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('ingestion','deletion','export')),
  status text not null default 'queued' check (status in ('queued','running','complete','failed','cancelled')),
  checkpoint jsonb not null default '{}',
  attempts integer not null default 0,
  lease_until timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);
create index jobs_project_idx on public.jobs(project_id);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
create policy profiles_owner on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter table public.sections enable row level security;
alter table public.sections force row level security;
create policy sections_owner on public.sections for all to authenticated
  using (private.owns_project(project_id)) with check (private.owns_project(project_id));
alter table public.notes enable row level security;
alter table public.notes force row level security;
create policy notes_owner on public.notes for all to authenticated
  using (private.owns_project(project_id)) with check (private.owns_project(project_id));
alter table public.sources enable row level security;
alter table public.sources force row level security;
create policy sources_read on public.sources for select to authenticated
  using (private.owns_project(project_id) and deleted_at is null);
alter table public.source_pages enable row level security;
alter table public.source_pages force row level security;
create policy source_pages_read on public.source_pages for select to authenticated
  using (private.owns_project(project_id) and exists(select 1 from public.sources where id = source_id and deleted_at is null));
alter table public.jobs enable row level security;
alter table public.jobs force row level security;
create policy jobs_read on public.jobs for select to authenticated
  using (private.owns_project(project_id));

-- Explicit grants avoid relying on Supabase's permissive default table grants.
revoke all on public.profiles, public.projects, public.sections, public.sources, public.source_pages, public.notes, public.jobs from anon, authenticated;
grant select, insert, update, delete on public.profiles, public.sections, public.notes to authenticated;
grant select on public.projects, public.sources, public.source_pages, public.jobs to authenticated;
grant insert (owner_id, title, citation_style) on public.projects to authenticated;
grant update (title, citation_style) on public.projects to authenticated;
-- Project/source deletion must go through the future cleanup worker, not direct browser DELETE.
grant all on public.profiles, public.projects, public.sections, public.sources, public.source_pages, public.notes, public.jobs to service_role;

create function private.touch_updated_at() returns trigger
  language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke all on function private.touch_updated_at() from public;
create trigger projects_updated before update on public.projects for each row execute function private.touch_updated_at();
create trigger sections_updated before update on public.sections for each row execute function private.touch_updated_at();
