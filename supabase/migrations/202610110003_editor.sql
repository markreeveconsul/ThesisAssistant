alter table public.projects
  add column research_problem text not null default '' check (char_length(research_problem) <= 4000),
  add column structure text not null default 'blank' check (structure in ('blank','five-chapter')),
  add column revision integer not null default 0 check (revision >= 0);
grant insert (research_problem, structure) on public.projects to authenticated;
grant update (research_problem, revision) on public.projects to authenticated;

-- A stale client must not silently overwrite a newer chapter, including via REST.
create function private.require_next_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.revision <> old.revision + 1 then
    raise exception 'Revision conflict. Reload the current version.' using errcode = '40001';
  end if;
  return new;
end;
$$;
revoke all on function private.require_next_revision() from public;
create trigger sections_revision before update on public.sections
  for each row execute function private.require_next_revision();
create trigger projects_revision before update on public.projects
  for each row execute function private.require_next_revision();

create function public.create_thesis(p_title text, p_problem text, p_style text, p_structure text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare project uuid; heading text; n integer := 0;
begin
  insert into public.projects(owner_id,title,research_problem,citation_style,structure)
    values(auth.uid(),p_title,p_problem,p_style,p_structure) returning id into project;
  if p_structure = 'five-chapter' then
    foreach heading in array array['Introduction','Review of related literature','Methodology','Results and discussion','Conclusions'] loop
      insert into public.sections(project_id,title,position) values(project,heading,n);
      n := n + 1;
    end loop;
  end if;
  return project;
end;
$$;
revoke all on function public.create_thesis(text,text,text,text) from public,anon;
grant execute on function public.create_thesis(text,text,text,text) to authenticated;

create function public.reorder_chapters(p_project uuid, p_sections jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare item jsonb; n integer := 0; affected integer;
begin
  if not private.owns_project(p_project) then raise exception 'Project unavailable'; end if;
  perform 1 from public.projects where id = p_project for update;
  if jsonb_typeof(p_sections) <> 'array' then raise exception 'Invalid chapter order'; end if;
  if jsonb_array_length(p_sections) <> (select count(*) from public.sections where project_id=p_project and parent_id is null)
    or jsonb_array_length(p_sections) <> (select count(distinct value->>'id') from jsonb_array_elements(p_sections))
  then raise exception 'Chapter list changed. Reload first.' using errcode='40001'; end if;
  for item in select value from jsonb_array_elements(p_sections) loop
    update public.sections set position=n,revision=revision+1
      where project_id=p_project and parent_id is null and id=(item->>'id')::uuid and revision=(item->>'revision')::integer;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Chapter changed. Reload first.' using errcode='40001'; end if;
    n := n + 1;
  end loop;
end;
$$;
revoke all on function public.reorder_chapters(uuid,jsonb) from public,anon;
grant execute on function public.reorder_chapters(uuid,jsonb) to authenticated;
