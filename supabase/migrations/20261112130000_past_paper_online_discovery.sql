-- Online Past Paper Discovery, integrated with the existing qb_schools and qb_source_papers catalogue.
-- Candidates remain isolated until an Admin verifies and explicitly imports them.

create table if not exists public.qb_paper_discovery_sources (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) between 2 and 200),
  domain text not null check (
    length(btrim(domain)) between 3 and 253
    and lower(domain) = domain
    and domain !~ '[/@:]'
    and domain !~ '[[:space:]]'
  ),
  source_type text not null check (source_type in ('board', 'school', 'education_portal')),
  trust_level text not null default 'review' check (trust_level in ('official', 'trusted', 'review')),
  priority integer not null default 100 check (priority between 1 and 1000),
  enabled boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists qb_paper_discovery_sources_domain_uidx
  on public.qb_paper_discovery_sources (domain);
create index if not exists qb_paper_discovery_sources_enabled_priority_idx
  on public.qb_paper_discovery_sources (enabled, priority, source_type);
alter table public.qb_paper_discovery_sources enable row level security;
revoke all on public.qb_paper_discovery_sources from anon, authenticated;
grant select, insert, update, delete on public.qb_paper_discovery_sources to authenticated;
create policy qb_paper_discovery_sources_admin_all on public.qb_paper_discovery_sources
  for all to authenticated
  using (public.qb_my_role() = 'Admin')
  with check (public.qb_my_role() = 'Admin');

create table if not exists public.qb_paper_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  query_text text not null check (length(btrim(query_text)) between 2 and 500),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  status text not null default 'running' check (status in ('running','completed','failed')),
  results_found integer not null default 0 check (results_found >= 0),
  error_message text,
  started_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists qb_paper_discovery_runs_started_idx
  on public.qb_paper_discovery_runs (started_at desc);
alter table public.qb_paper_discovery_runs enable row level security;
revoke all on public.qb_paper_discovery_runs from anon, authenticated;
grant select on public.qb_paper_discovery_runs to authenticated;
create policy qb_paper_discovery_runs_admin_read on public.qb_paper_discovery_runs
  for select to authenticated using (public.qb_my_role() = 'Admin');

create table if not exists public.qb_paper_discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  discovery_run_id uuid references public.qb_paper_discovery_runs(id) on delete set null,
  source_id uuid references public.qb_paper_discovery_sources(id) on delete set null,
  source_type text not null check (source_type in ('board','school','education_portal')),
  source_domain text not null,
  title text not null check (length(btrim(title)) between 2 and 500),
  source_url text not null check (length(btrim(source_url)) between 8 and 2048),
  pdf_url text check (pdf_url is null or length(btrim(pdf_url)) between 8 and 2048),
  board_id uuid references public.boards(id) on delete restrict,
  school_id uuid references public.qb_schools(id) on delete restrict,
  discovered_school_name text,
  grade_id uuid references public.grades(id) on delete set null,
  class_label text,
  subject_name text,
  year integer check (year is null or year between 1900 and 2200),
  exam_type text,
  medium text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','verified','inaccessible','unsafe_url','invalid_pdf','duplicate')),
  status text not null default 'discovered'
    check (status in ('discovered','needs_review','approved_for_import','imported','rejected','duplicate','failed')),
  checksum text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  duplicate_of_paper_id uuid references public.qb_source_papers(id) on delete set null,
  imported_paper_id uuid references public.qb_source_papers(id) on delete set null,
  rejection_reason text,
  discovery_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(discovery_metadata) = 'object'),
  discovered_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_paper_discovery_candidate_source_check check (
    (source_type = 'board' and board_id is not null and school_id is null)
    or (source_type = 'school' and board_id is null)
    or (source_type = 'education_portal' and ((board_id is null) <> (school_id is null)))
  ),
  constraint qb_paper_discovery_candidate_import_check check (
    status <> 'imported' or imported_paper_id is not null
  )
);
create unique index if not exists qb_paper_discovery_candidates_source_url_uidx
  on public.qb_paper_discovery_candidates (lower(source_url));
create index if not exists qb_paper_discovery_candidates_review_queue_idx
  on public.qb_paper_discovery_candidates (status, discovered_at desc);
create index if not exists qb_paper_discovery_candidates_school_lookup_idx
  on public.qb_paper_discovery_candidates (school_id, year desc, subject_name)
  where school_id is not null;
create index if not exists qb_paper_discovery_candidates_checksum_idx
  on public.qb_paper_discovery_candidates (checksum) where checksum is not null;
alter table public.qb_paper_discovery_candidates enable row level security;
revoke all on public.qb_paper_discovery_candidates from anon, authenticated;
grant select, update on public.qb_paper_discovery_candidates to authenticated;
create policy qb_paper_discovery_candidates_admin_read on public.qb_paper_discovery_candidates
  for select to authenticated using (public.qb_my_role() = 'Admin');
create policy qb_paper_discovery_candidates_admin_update on public.qb_paper_discovery_candidates
  for update to authenticated using (public.qb_my_role() = 'Admin')
  with check (public.qb_my_role() = 'Admin');

-- Official board sources. School domains are added and verified by Admin as the directory grows.
insert into public.qb_paper_discovery_sources (display_name, domain, source_type, trust_level, priority, notes)
values
  ('CBSE Academic', 'cbseacademic.nic.in', 'board', 'official', 1, 'Official CBSE academic resources'),
  ('Central Board of Secondary Education', 'cbse.gov.in', 'board', 'official', 2, 'Official CBSE website'),
  ('Council for the Indian School Certificate Examinations', 'cisce.org', 'board', 'official', 3, 'Official CISCE website'),
  ('Karnataka School Examination and Assessment Board', 'kseab.karnataka.gov.in', 'board', 'official', 4, 'Official Karnataka board website')
on conflict (domain) do update set
  display_name = excluded.display_name,
  source_type = excluded.source_type,
  trust_level = excluded.trust_level,
  priority = excluded.priority,
  notes = excluded.notes,
  updated_at = now();

comment on table public.qb_paper_discovery_sources is
  'Admin-managed allowlist of domains for online Past Paper discovery.';
comment on table public.qb_paper_discovery_runs is
  'Audit trail for Admin-initiated online Past Paper searches.';
comment on table public.qb_paper_discovery_candidates is
  'Unpublished online paper candidates. Only explicit Admin import creates a qb_source_papers row.';
