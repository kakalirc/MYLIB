-- Let Students and Parents browse the published Past Papers catalogue.
-- Existing Admin and Teacher policies remain in place. No paper data or storage objects are changed.

grant select on public.qb_source_papers to authenticated;
grant select on public.qb_schools to authenticated;

drop policy if exists qb_source_papers_student_parent_published on public.qb_source_papers;
create policy qb_source_papers_student_parent_published
on public.qb_source_papers
for select
to authenticated
using (
  qb_my_role() in ('Student', 'Parent')
  and status = 'published'
);

drop policy if exists qb_schools_read on public.qb_schools;
create policy qb_schools_read
on public.qb_schools
for select
to authenticated
using (
  qb_my_role() in ('Admin', 'Student', 'Parent')
  or (qb_my_role() = 'Teacher' and qb_my_qb_access())
);

drop policy if exists qb_papers_student_parent_read_published on storage.objects;
create policy qb_papers_student_parent_read_published
on storage.objects
for select
to authenticated
using (
  bucket_id = 'qb-papers'
  and qb_my_role() in ('Student', 'Parent')
  and exists (
    select 1
    from public.qb_source_papers sp
    where sp.status = 'published'
      and (
        sp.stored_pdf_url = 'qb-papers/' || objects.name
        or right(split_part(sp.stored_pdf_url, '?', 1), length('/qb-papers/' || objects.name)) = '/qb-papers/' || objects.name
      )
  )
);
