-- Past-paper upload lifecycle and private storage access.
-- Existing source papers remain published; newly uploaded papers are pending review.
alter table public.qb_source_papers
  add column if not exists status text not null default 'published';

alter table public.qb_source_papers
  drop constraint if exists qb_source_papers_status_check;
alter table public.qb_source_papers
  add constraint qb_source_papers_status_check
  check (status in ('pending_review', 'published', 'rejected'));

-- Past-paper PDFs must not be reachable through the public object URL while pending.
update storage.buckets
set public = false,
    allowed_mime_types = array['application/pdf']::text[]
where id = 'qb-papers';

-- Remove the broad teacher-switch policy: it previously OR-ed around the
-- subject-scoped read policy and would expose pending papers to QB-enabled teachers.
drop policy if exists qb_teacher_switch on public.qb_source_papers;
drop policy if exists qb_source_papers_teacher_read on public.qb_source_papers;
create policy qb_source_papers_teacher_read
on public.qb_source_papers
for select to authenticated
using (
  qb_my_role() = 'Teacher'
  and qb_my_qb_access()
  and status = 'published'
  and qb_teacher_teaches(subject_name, grade_id)
);

-- Admin retains full control of the source-paper metadata table.
drop policy if exists qb_source_papers_admin on public.qb_source_papers;
create policy qb_source_papers_admin
on public.qb_source_papers
for all to authenticated
using (qb_my_role() = 'Admin')
with check (qb_my_role() = 'Admin');

-- Keep the teacher-switch guard for the other Question Bank buckets, but
-- never grant a teacher broad access to qb-papers.
drop policy if exists qb_teacher_switch on storage.objects;
create policy qb_teacher_switch
on storage.objects
for all to authenticated
using (
  bucket_id not in ('qb-images', 'qb-papers', 'practice-answers')
  or (bucket_id = 'qb-papers' and qb_my_role() = 'Admin')
  or (bucket_id in ('qb-images', 'practice-answers')
      and (qb_my_role() is distinct from 'Teacher' or qb_my_qb_access()))
)
with check (
  bucket_id not in ('qb-images', 'qb-papers', 'practice-answers')
  or (bucket_id = 'qb-papers' and qb_my_role() = 'Admin')
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
    select 1
    from public.qb_source_papers sp
    where (
      sp.stored_pdf_url = ('qb-papers/' || objects.name)
      or sp.stored_pdf_url like ('%/qb-papers/' || objects.name || '%')
    )
    and sp.status = 'published'
    and qb_teacher_teaches(sp.subject_name, sp.grade_id)
  )
);

drop policy if exists qb_papers_admin_all on storage.objects;
create policy qb_papers_admin_all
on storage.objects
for all to authenticated
using (bucket_id = 'qb-papers' and qb_my_role() = 'Admin')
with check (bucket_id = 'qb-papers' and qb_my_role() = 'Admin');
