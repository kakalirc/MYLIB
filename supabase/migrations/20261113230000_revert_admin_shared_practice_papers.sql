-- Revert PR #255 shared practice-paper access while preserving existing rows.
-- Keep created_by_teacher_id nullable because one Admin-created row has no owner.
-- Keep is_shared column as an inert compatibility field; no shared-paper access remains.

drop policy if exists qb_papers_shared_published_read on public.qb_practice_papers;
drop policy if exists qb_paper_questions_shared_read on public.qb_paper_questions;

drop policy if exists qb_papers_teacher on public.qb_practice_papers;
create policy qb_papers_teacher
  on public.qb_practice_papers
  for all
  to authenticated
  using (created_by_teacher_id = qb_my_teacher_id())
  with check (created_by_teacher_id = qb_my_teacher_id());
