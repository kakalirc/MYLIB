create or replace function public.teacher_appraisal_config_immutable()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.status in ('published','archived') and new.config is distinct from old.config then
  raise exception 'Published appraisal configuration is immutable. Create a new version.';
 end if;
 if old.status='archived' and new.status is distinct from old.status
    and not (new.status='published' and new.config is not distinct from old.config) then
  raise exception 'Archived appraisal configuration is immutable except for restoring an unchanged version after a failed publish.';
 end if;
 return new;
end $$;
drop policy if exists teacher_appraisal_configs_admin on public.teacher_appraisal_configs;
create policy teacher_appraisal_configs_admin on public.teacher_appraisal_configs for all to authenticated
using(public.my_role()='Admin' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Admin' and coalesce(p.archived,false)=false))
with check(public.my_role()='Admin' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Admin' and coalesce(p.archived,false)=false));
drop policy if exists teacher_appraisal_periods_admin on public.teacher_appraisal_periods;
create policy teacher_appraisal_periods_admin on public.teacher_appraisal_periods for all to authenticated
using(public.my_role()='Admin' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Admin' and coalesce(p.archived,false)=false))
with check(public.my_role()='Admin' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Admin' and coalesce(p.archived,false)=false));
drop policy if exists teacher_appraisals_admin on public.teacher_appraisals;
create policy teacher_appraisals_admin on public.teacher_appraisals for all to authenticated
using(public.my_role()='Admin' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Admin' and coalesce(p.archived,false)=false))
with check(public.my_role()='Admin' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Admin' and coalesce(p.archived,false)=false));
drop policy if exists teacher_appraisal_audit_admin on public.teacher_appraisal_audit;
create policy teacher_appraisal_audit_admin on public.teacher_appraisal_audit for select to authenticated
using(public.my_role()='Admin' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Admin' and coalesce(p.archived,false)=false));
drop policy if exists teacher_appraisal_frequency_history_admin on public.teacher_appraisal_frequency_history;
create policy teacher_appraisal_frequency_history_admin on public.teacher_appraisal_frequency_history for select to authenticated
using(public.my_role()='Admin' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Admin' and coalesce(p.archived,false)=false));