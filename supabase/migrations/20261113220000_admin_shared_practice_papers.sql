-- Allow Admin-owned shared practice papers without a teacher owner.
alter table public.qb_practice_papers
  alter column created_by_teacher_id drop not null;

alter table public.qb_practice_papers
  add column if not exists is_shared boolean not null default false;

-- Teachers can read only published shared papers; ownership remains teacher-only for private papers.
drop policy if exists qb_papers_teacher on public.qb_practice_papers;
create policy qb_papers_teacher
  on public.qb_practice_papers
  for all
  to authenticated
  using (
    created_by_teacher_id = qb_my_teacher_id()
    and coalesce(is_shared, false) = false
  )
  with check (
    created_by_teacher_id = qb_my_teacher_id()
    and coalesce(is_shared, false) = false
  );

drop policy if exists qb_papers_shared_published_read on public.qb_practice_papers;
create policy qb_papers_shared_published_read
  on public.qb_practice_papers
  for select
  to authenticated
  using (
    qb_my_role() = 'Teacher'
    and coalesce(is_shared, false) = true
    and status = 'published'
  );

-- A teacher can read question links belonging to a published shared paper,
-- but cannot modify them: the existing teacher ALL policy still requires ownership.
drop policy if exists qb_paper_questions_shared_read on public.qb_paper_questions;
create policy qb_paper_questions_shared_read
  on public.qb_paper_questions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.qb_practice_papers p
      where p.id = qb_paper_questions.paper_id
        and p.is_shared = true
        and p.status = 'published'
    )
  );
