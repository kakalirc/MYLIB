-- Teacher past-paper submissions, ownership, review history, and private PDF access.
-- Existing published papers are retained; legacy rows remain visible with a neutral uploader label.

alter table public.qb_source_papers
  add column if not exists uploaded_by uuid references public.profiles(id) on delete set null,
  add column if not exists uploader_name text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

update public.qb_source_papers
set uploader_name = 'Legacy upload'
where uploader_name is null;

create index if not exists qb_source_papers_uploaded_by_status_idx
  on public.qb_source_papers (uploaded_by, status);

create table if not exists public.qb_source_paper_reviews (
  id bigint generated always as identity primary key,
  source_paper_id uuid not null references public.qb_source_papers(id) on delete cascade,
  from_status text,
  to_status text not null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz not null default now()
);

alter table public.qb_source_paper_reviews enable row level security;

drop policy if exists qb_source_paper_reviews_read on public.qb_source_paper_reviews;
create policy qb_source_paper_reviews_read
on public.qb_source_paper_reviews
for select to authenticated
using (
  qb_my_role() = 'Admin'
  or (
    qb_my_role() = 'Teacher'
    and exists (
      select 1 from public.qb_source_papers sp
      where sp.id = source_paper_id
        and sp.uploaded_by = auth.uid()
    )
  )
);

create or replace function public.qb_source_papers_guard_and_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
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
$$;

drop trigger if exists qb_source_papers_guard_and_stamp_trg on public.qb_source_papers;
create trigger qb_source_papers_guard_and_stamp_trg
before insert or update on public.qb_source_papers
for each row execute function public.qb_source_papers_guard_and_stamp();

create or replace function public.qb_source_papers_audit_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.qb_source_paper_reviews
      (source_paper_id, from_status, to_status, reviewed_by, reviewed_at)
    values
      (new.id, old.status, new.status, auth.uid(), coalesce(new.reviewed_at, now()));
  end if;
  return new;
end;
$$;
revoke all on function public.qb_source_papers_audit_status() from public;

drop trigger if exists qb_source_papers_audit_status_trg on public.qb_source_papers;
create trigger qb_source_papers_audit_status_trg
after update on public.qb_source_papers
for each row execute function public.qb_source_papers_audit_status();

drop policy if exists qb_source_papers_teacher_read on public.qb_source_papers;
create policy qb_source_papers_teacher_read
on public.qb_source_papers
for select to authenticated
using (
  qb_my_role() = 'Teacher'
  and qb_my_qb_access()
  and (status = 'published' or uploaded_by = auth.uid())
);

drop policy if exists qb_source_papers_teacher_insert on public.qb_source_papers;
create policy qb_source_papers_teacher_insert
on public.qb_source_papers
for insert to authenticated
with check (
  qb_my_role() = 'Teacher'
  and qb_my_qb_access()
  and uploaded_by = auth.uid()
  and status = 'pending_review'
);

drop policy if exists qb_source_papers_teacher_update_own on public.qb_source_papers;
create policy qb_source_papers_teacher_update_own
on public.qb_source_papers
for update to authenticated
using (
  qb_my_role() = 'Teacher'
  and qb_my_qb_access()
  and uploaded_by = auth.uid()
  and status = 'pending_review'
)
with check (
  qb_my_role() = 'Teacher'
  and qb_my_qb_access()
  and uploaded_by = auth.uid()
  and status in ('published', 'rejected')
);

-- Permit enabled teachers to access this private bucket; object-level policies below
-- still limit uploads to their own folder and reads to published or own submissions.
drop policy if exists qb_teacher_switch on storage.objects;
create policy qb_teacher_switch
on storage.objects
as restrictive
for all to authenticated
using (
  bucket_id not in ('qb-images', 'qb-papers', 'practice-answers')
  or (bucket_id = 'qb-papers' and qb_my_role() in ('Admin', 'Teacher') and (qb_my_role() = 'Admin' or qb_my_qb_access()))
  or (bucket_id in ('qb-images', 'practice-answers')
      and (qb_my_role() is distinct from 'Teacher' or qb_my_qb_access()))
)
with check (
  bucket_id not in ('qb-images', 'qb-papers', 'practice-answers')
  or (bucket_id = 'qb-papers' and qb_my_role() in ('Admin', 'Teacher') and (qb_my_role() = 'Admin' or qb_my_qb_access()))
  or (bucket_id in ('qb-images', 'practice-answers')
      and (qb_my_role() is distinct from 'Teacher' or qb_my_qb_access()))
);

drop policy if exists qb_papers_teacher_read on storage.objects;
create policy qb_papers_teacher_read
on storage.objects
for select to authenticated
using (
  bucket_id = 'qb-papers'
  and qb_my_role() = 'Teacher'
  and qb_my_qb_access()
  and exists (
    select 1 from public.qb_source_papers sp
    where sp.stored_pdf_url = ('qb-papers/' || objects.name)
      and (sp.status = 'published' or sp.uploaded_by = auth.uid())
  )
);

drop policy if exists qb_papers_teacher_upload on storage.objects;
create policy qb_papers_teacher_upload
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'qb-papers'
  and qb_my_role() = 'Teacher'
  and qb_my_qb_access()
  and (storage.foldername(name))[1] = 'source-papers'
  and (storage.foldername(name))[2] = qb_my_teacher_id()::text
);
