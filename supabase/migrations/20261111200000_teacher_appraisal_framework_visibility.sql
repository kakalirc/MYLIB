-- Teacher-facing appraisal framework visibility.
-- Keeps all appraisal records and full configuration tables Admin-only.
create table if not exists public.teacher_appraisal_framework_visibility (
  id boolean primary key default true check (id = true),
  enabled boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.teacher_appraisal_framework_visibility (id, enabled)
values (true, false)
on conflict (id) do nothing;

create table if not exists public.teacher_appraisal_framework_teacher_access (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_appraisal_framework_visibility_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  teacher_id uuid references public.teachers(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  scope text not null check (scope in ('global','teacher')),
  old_enabled boolean,
  new_enabled boolean not null,
  changed_at timestamptz not null default now()
);

alter table public.teacher_appraisal_framework_visibility enable row level security;
alter table public.teacher_appraisal_framework_teacher_access enable row level security;
alter table public.teacher_appraisal_framework_visibility_audit enable row level security;

drop policy if exists teacher_appraisal_framework_visibility_admin on public.teacher_appraisal_framework_visibility;
create policy teacher_appraisal_framework_visibility_admin
on public.teacher_appraisal_framework_visibility
for all to authenticated
using (
  public.my_role() = 'Admin'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin' and coalesce(p.archived,false) = false)
)
with check (
  public.my_role() = 'Admin'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin' and coalesce(p.archived,false) = false)
);

drop policy if exists teacher_appraisal_framework_teacher_access_admin on public.teacher_appraisal_framework_teacher_access;
create policy teacher_appraisal_framework_teacher_access_admin
on public.teacher_appraisal_framework_teacher_access
for all to authenticated
using (
  public.my_role() = 'Admin'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin' and coalesce(p.archived,false) = false)
)
with check (
  public.my_role() = 'Admin'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin' and coalesce(p.archived,false) = false)
);

drop policy if exists teacher_appraisal_framework_visibility_audit_admin_read on public.teacher_appraisal_framework_visibility_audit;
create policy teacher_appraisal_framework_visibility_audit_admin_read
on public.teacher_appraisal_framework_visibility_audit
for select to authenticated
using (
  public.my_role() = 'Admin'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin' and coalesce(p.archived,false) = false)
);

create or replace function public.audit_teacher_appraisal_framework_visibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_enabled boolean;
begin
  if tg_op = 'INSERT' then
    v_old_enabled := null;
  else
    v_old_enabled := old.enabled;
  end if;

  if v_old_enabled is distinct from new.enabled then
    if tg_table_name = 'teacher_appraisal_framework_visibility' then
      insert into public.teacher_appraisal_framework_visibility_audit(actor_id,scope,old_enabled,new_enabled)
      values (auth.uid(),'global',v_old_enabled,new.enabled);
    else
      insert into public.teacher_appraisal_framework_visibility_audit(actor_id,teacher_id,profile_id,scope,old_enabled,new_enabled)
      values (auth.uid(),new.teacher_id,new.profile_id,'teacher',v_old_enabled,new.enabled);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.audit_teacher_appraisal_framework_visibility() from public, anon, authenticated;

drop trigger if exists trg_audit_teacher_appraisal_framework_global on public.teacher_appraisal_framework_visibility;
create trigger trg_audit_teacher_appraisal_framework_global
after insert or update on public.teacher_appraisal_framework_visibility
for each row execute function public.audit_teacher_appraisal_framework_visibility();

drop trigger if exists trg_audit_teacher_appraisal_framework_teacher on public.teacher_appraisal_framework_teacher_access;
create trigger trg_audit_teacher_appraisal_framework_teacher
after insert or update on public.teacher_appraisal_framework_teacher_access
for each row execute function public.audit_teacher_appraisal_framework_visibility();

create or replace function public.get_teacher_appraisal_framework()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_teacher_id uuid;
  v_enabled boolean;
  v_config record;
  v_categories jsonb;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'Teacher'
      and coalesce(p.archived,false) = false
  ) or public.my_role() <> 'Teacher' then
    raise exception 'Teacher access only';
  end if;

  select p.linked_teacher_id into v_teacher_id
  from public.profiles p where p.id = auth.uid();

  if v_teacher_id is null then
    raise exception 'No teacher profile is linked to this login';
  end if;

  select coalesce(g.enabled,false) and coalesce(t.enabled,false)
    into v_enabled
  from public.teacher_appraisal_framework_visibility g
  left join public.teacher_appraisal_framework_teacher_access t
    on t.profile_id = auth.uid() and t.teacher_id = v_teacher_id
  where g.id = true;

  if not coalesce(v_enabled,false) then
    raise exception 'The appraisal framework is not currently available for your account';
  end if;

  select c.id,c.version,c.effective_from,c.config
    into v_config
  from public.teacher_appraisal_configs c
  where c.status = 'published'
    and c.effective_from <= current_date
  order by c.effective_from desc,c.version desc
  limit 1;

  if not found then
    raise exception 'No effective published appraisal framework is available';
  end if;

  -- Deliberately expose only teacher-facing criterion details. Internal evidence
  -- table names, filters, applicability IDs, private appraisal data and notes stay private.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',cat->>'id',
      'name',cat->>'name',
      'weight',cat->'weight',
      'subcategories',(
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id',sub->>'id',
            'name',sub->>'name',
            'weight',sub->'weight',
            'metrics',(
              select coalesce(jsonb_agg(
                jsonb_strip_nulls(jsonb_build_object(
                  'id',m->>'id',
                  'name',m->>'name',
                  'weight',m->'weight',
                  'method',m->>'method',
                  'description',m->>'description',
                  'target',m->'target',
                  'deadline_hours',m->'deadline_hours',
                  'grace_hours',m->'grace_hours',
                  'bands',case when m->>'method'='timeliness_bands' then m->'bands' else null end,
                  'score_bands',m->'score_bands'
                )) order by ordm
              ),'[]'::jsonb)
              from jsonb_array_elements(coalesce(sub->'metrics','[]'::jsonb)) with ordinality as mm(m,ordm)
            )
          ) order by ords
        ),'[]'::jsonb)
        from jsonb_array_elements(coalesce(cat->'subcategories','[]'::jsonb)) with ordinality as ss(sub,ords)
      )
    ) order by ordc
  ),'[]'::jsonb)
  into v_categories
  from jsonb_array_elements(coalesce(v_config.config->'categories','[]'::jsonb)) with ordinality as cc(cat,ordc);

  v_result := jsonb_build_object(
    'version',v_config.version,
    'effective_from',v_config.effective_from,
    'categories',v_categories,
    'rating_bands',coalesce(v_config.config->'rating_bands','[]'::jsonb)
  );
  return v_result;
end;
$$;

revoke all on function public.get_teacher_appraisal_framework() from public, anon;
grant execute on function public.get_teacher_appraisal_framework() to authenticated;
