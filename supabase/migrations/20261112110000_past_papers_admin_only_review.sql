-- Restrict Past Papers moderation to Admin accounts only.
-- Teachers may submit and view their own pending/rejected contributions, but cannot
-- publish or reject any submission. This complements the Admin-only UI with DB enforcement.

drop policy if exists qb_source_papers_teacher_update_own on public.qb_source_papers;

create or replace function public.qb_source_papers_guard_and_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_role text := qb_my_role();
  v_name text;
begin
  if tg_op = 'INSERT' then
    if v_role = 'Teacher' then
      if not qb_my_qb_access() then
        raise exception 'Question Bank access is not enabled';
      end if;
      new.uploaded_by := auth.uid();
      select t.name into v_name
      from public.teachers t
      where t.id = qb_my_teacher_id();
    elsif v_role = 'Admin' then
      new.uploaded_by := coalesce(new.uploaded_by, auth.uid());
      select coalesce(p.admin_name, p.username) into v_name
      from public.profiles p where p.id = new.uploaded_by;
    else
      raise exception 'Only Admin or enabled Teachers may submit past papers';
    end if;
    new.uploader_name := coalesce(v_name, 'Unknown uploader');
    new.status := 'pending_review';
    new.reviewed_by := null;
    new.reviewed_at := null;
    return new;
  end if;

  if v_role <> 'Admin' then
    raise exception 'Only Admin may review or modify past-paper submissions';
  end if;

  if new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$function$;

revoke all on function public.qb_source_papers_guard_and_stamp() from public;
