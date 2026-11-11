-- Add a managed school directory and allow past papers to belong to either a Board or a School.
-- Existing rows remain Board papers; no existing metadata or files are rewritten.

create table if not exists public.qb_schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 200),
  archived boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists qb_schools_name_normalized_uidx
  on public.qb_schools (lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')));

alter table public.qb_schools enable row level security;
grant select, insert, update on public.qb_schools to authenticated;

drop policy if exists qb_schools_read on public.qb_schools;
create policy qb_schools_read
on public.qb_schools
for select to authenticated
using (
  qb_my_role() = 'Admin'
  or (qb_my_role() = 'Teacher' and qb_my_qb_access())
);

drop policy if exists qb_schools_admin_insert on public.qb_schools;
create policy qb_schools_admin_insert
on public.qb_schools
for insert to authenticated
with check (qb_my_role() = 'Admin' and created_by = auth.uid());

drop policy if exists qb_schools_admin_update on public.qb_schools;
create policy qb_schools_admin_update
on public.qb_schools
for update to authenticated
using (qb_my_role() = 'Admin')
with check (qb_my_role() = 'Admin');

alter table public.qb_source_papers
  alter column board_id drop not null,
  add column if not exists source_type text not null default 'board',
  add column if not exists school_id uuid references public.qb_schools(id) on delete restrict;

alter table public.qb_source_papers
  drop constraint if exists qb_source_papers_source_type_check,
  add constraint qb_source_papers_source_type_check
    check (source_type in ('board', 'school')),
  drop constraint if exists qb_source_papers_source_reference_check,
  add constraint qb_source_papers_source_reference_check
    check (
      (source_type = 'board' and board_id is not null and school_id is null)
      or
      (source_type = 'school' and board_id is null and school_id is not null)
    );

create index if not exists qb_source_papers_school_grade_subject_idx
  on public.qb_source_papers (school_id, grade_id, subject_name, year desc)
  where source_type = 'school';

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
    if new.source_type = 'board' then
      if new.board_id is null or new.school_id is not null then
        raise exception 'Select exactly one Board or School as the paper source';
      end if;
    elsif new.source_type = 'school' then
      if new.school_id is null or new.board_id is not null then
        raise exception 'Select exactly one Board or School as the paper source';
      end if;
    else
      raise exception 'Invalid past-paper source type';
    end if;

    if v_role = 'Teacher' then
      if not qb_my_qb_access() then
        raise exception 'Question Bank access is not enabled';
      end if;
      new.uploaded_by := auth.uid();
      select t.name into v_name
      from public.teachers t
      where t.id = qb_my_teacher_id();
    else
      new.uploaded_by := coalesce(new.uploaded_by, auth.uid());
      select coalesce(p.admin_name, p.username) into v_name
      from public.profiles p where p.id = new.uploaded_by;
    end if;
    new.uploader_name := coalesce(v_name, 'Unknown uploader');
    new.status := 'pending_review';
    new.reviewed_by := null;
    new.reviewed_at := null;
    return new;
  end if;

  if v_role = 'Teacher' then
    if old.uploaded_by is distinct from auth.uid()
       or new.uploaded_by is distinct from old.uploaded_by
       or new.uploader_name is distinct from old.uploader_name
       or new.source_type is distinct from old.source_type
       or new.school_id is distinct from old.school_id
       or new.board_id is distinct from old.board_id
       or new.grade_id is distinct from old.grade_id
       or new.subject_name is distinct from old.subject_name
       or new.year is distinct from old.year
       or new.exam_type is distinct from old.exam_type
       or new.medium is distinct from old.medium
       or new.source_url is distinct from old.source_url
       or new.stored_pdf_url is distinct from old.stored_pdf_url
       or new.pdf_type is distinct from old.pdf_type
       or new.download_date is distinct from old.download_date
       or new.extraction_status is distinct from old.extraction_status
       or new.question_count is distinct from old.question_count
       or new.checksum is distinct from old.checksum then
      raise exception 'Teachers may only review their own submission; paper metadata and ownership are immutable';
    end if;
    if old.status <> 'pending_review' or new.status not in ('published', 'rejected') then
      raise exception 'Only your own pending submission can be published or rejected';
    end if;
  end if;

  if new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$function$;

revoke all on function public.qb_source_papers_guard_and_stamp() from public;
