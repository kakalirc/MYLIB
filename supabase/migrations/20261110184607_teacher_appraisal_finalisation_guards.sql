create or replace function public.teacher_appraisal_guard_finalised()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='DELETE' then
  if old.status='finalised' then raise exception 'A finalised appraisal cannot be deleted. Reopen it first.'; end if;
  return old;
 end if;
 if old.status='finalised' then
  if new.status<>'reopened' or new.reopen_reason is null or length(trim(new.reopen_reason))=0 or new.reopened_by is null then
   raise exception 'A finalised appraisal is immutable. Reopen it with an Admin reason before editing.';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists teacher_appraisal_finalised_guard_trg on public.teacher_appraisals;
create trigger teacher_appraisal_finalised_guard_trg before update or delete on public.teacher_appraisals for each row execute function public.teacher_appraisal_guard_finalised();
create or replace function public.teacher_appraisal_config_immutable()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.status in ('published','archived') and new.config is distinct from old.config then
  raise exception 'Published appraisal configuration is immutable. Create a new version.';
 end if;
 if old.status='archived' and new.status is distinct from old.status then
  raise exception 'Archived appraisal configuration is immutable.';
 end if;
 return new;
end $$;
drop trigger if exists teacher_appraisal_config_immutable_trg on public.teacher_appraisal_configs;
create trigger teacher_appraisal_config_immutable_trg before update on public.teacher_appraisal_configs for each row execute function public.teacher_appraisal_config_immutable();