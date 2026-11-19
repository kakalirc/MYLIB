-- Allow signed-in Student/Parent/Teacher/Admin users to read only the discovery
-- title attached to a paper that is already published and visible to them.
drop policy if exists qb_paper_discovery_candidates_published_title_read on public.qb_paper_discovery_candidates;
create policy qb_paper_discovery_candidates_published_title_read
  on public.qb_paper_discovery_candidates
  for select to authenticated
  using (
    imported_paper_id is not null
    and exists (
      select 1
      from public.qb_source_papers as paper
      where paper.id = qb_paper_discovery_candidates.imported_paper_id
        and paper.status = 'published'
    )
  );

-- The display title is derived from existing candidate titles and stored PDF paths.
-- Remove the temporary denormalized column and trigger; no separate title column is needed.
drop trigger if exists qb_source_papers_set_title_from_file on public.qb_source_papers;
drop function if exists public.qb_set_source_paper_title_from_file();
alter table public.qb_source_papers drop column if exists paper_title;
