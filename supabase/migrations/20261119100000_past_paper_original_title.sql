-- Preserve the original paper name from discovery through the published catalogue.
alter table public.qb_source_papers
  add column if not exists paper_title text;

-- Backfill papers imported before this field existed, while their discovery record remains available.
update public.qb_source_papers as paper
set paper_title = candidate.title
from public.qb_paper_discovery_candidates as candidate
where candidate.imported_paper_id = paper.id
  and nullif(btrim(paper.paper_title), '') is null
  and nullif(btrim(candidate.title), '') is not null;

comment on column public.qb_source_papers.paper_title is
  'Original display title of the question paper, preserved from its source when available.';
