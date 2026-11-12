-- Allow Teachers to approve only their own pending past-paper submissions.
-- Admin review permissions remain unchanged.

drop policy if exists qb_source_papers_teacher_approve_own on public.qb_source_papers;
create policy qb_source_papers_teacher_approve_own
  on public.qb_source_papers
  for update
  to authenticated
  using (
    qb_my_role() = 'Teacher'
    and qb_my_qb_access()
    and uploaded_by = (select auth.uid())
    and status = 'pending_review'
  )
  with check (
    qb_my_role() = 'Teacher'
    and qb_my_qb_access()
    and uploaded_by = (select auth.uid())
    and status = 'published'
  );

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

  if v_role = 'Teacher' then
    if not qb_my_qb_access() then
      raise exception 'Question Bank access is not enabled';
    end if;
    if old.uploaded_by is distinct from auth.uid() then
      raise exception 'Teachers may approve only their own past-paper submissions';
    end if;
    if old.status <> 'pending_review' or new.status <> 'published' then
      raise exception 'Teachers may only approve their own pending past-paper submissions';
    end if;
    if (to_jsonb(new) - 'status' - 'reviewed_by' - 'reviewed_at')
       is distinct from
       (to_jsonb(old) - 'status' - 'reviewed_by' - 'reviewed_at') then
      raise exception 'Teachers may not modify past-paper submission details';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    return new;
  end if;

  if v_role <> 'Admin' then
    raise exception 'Only Admin or the submitting Teacher may review past-paper submissions';
  end if;

  if new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$function$;