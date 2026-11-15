-- Pre-Search source intelligence and per-run source audit.
-- This is additive: existing discovery runs, candidates, imports and extraction history remain untouched.

create table if not exists public.qb_paper_discovery_run_sources (
  id uuid primary key default gen_random_uuid(),
  discovery_run_id uuid not null references public.qb_paper_discovery_runs(id) on delete cascade,
  source_id uuid references public.qb_paper_discovery_sources(id) on delete set null,
  domain text not null check (length(btrim(domain)) between 3 and 253),
  display_name text not null,
  source_type text check (source_type is null or source_type in ('board','school','education_portal')),
  source_classification text not null check (source_classification in ('approved','discovered')),
  outcome text not null check (outcome in ('pdf_found','no_matching_pdf','provider_error','inaccessible')),
  pdf_count integer not null default 0 check (pdf_count >= 0),
  provider text not null default 'web-search',
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  checked_at timestamptz not null default now()
);
create index if not exists qb_paper_discovery_run_sources_run_idx
  on public.qb_paper_discovery_run_sources (discovery_run_id, checked_at desc);
create index if not exists qb_paper_discovery_run_sources_domain_idx
  on public.qb_paper_discovery_run_sources (domain, checked_at desc);
create index if not exists qb_paper_discovery_run_sources_outcome_idx
  on public.qb_paper_discovery_run_sources (outcome, checked_at desc);

alter table public.qb_paper_discovery_run_sources enable row level security;
revoke all on public.qb_paper_discovery_run_sources from anon, authenticated;
grant select on public.qb_paper_discovery_run_sources to authenticated;
create policy qb_paper_discovery_run_sources_admin_read
  on public.qb_paper_discovery_run_sources
  for select to authenticated
  using (public.qb_my_role() = 'Admin');

comment on table public.qb_paper_discovery_run_sources is
  'Per-run audit of approved domains checked and newly discovered domains returning relevant question-paper PDFs. Repeated attempts are retained as separate rows.';
