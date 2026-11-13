-- Revert PR #255 shared practice-paper access while preserving the nullable owner column
-- and the is_shared column/data for safe rollback compatibility.
drop policy if exists qb_papers_shared_published_read on public.qb_practice_papers;
drop policy if exists qb_paper_questions_shared_read on public.qb_paper_questions;

drop policy if exists qb_papers_teacher on public.qb_practice_papers;
create policy qb_papers_teacher
  on public.qb_practice_papers
  for all
  to authenticated
  using (created_by_teacher_id = qb_my_teacher_id())
  with check (created_by_teacher_id = qb_my_teacher_id());

-- Deliberately retain created_by_teacher_id nullable and is_shared:
-- an ownerless Admin-created row already exists, and must not be deleted or reassigned.
