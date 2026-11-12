-- Online Past Paper Discovery: trusted source registry, isolated candidates,
-- and teacher-submitted school-name suggestions. Existing paper rows are untouched.

create table if not exists public.qb_paper_discovery_sources (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) between 2 and 200),
  domain text not null check (
    length(btrim(domain)) between 3 and 253
    and lower(domain) = domain
    and domain !~ '[/@:]'
    and domain !~ '[[:space:]]'
  ),
  source_type text not null check (
    source_type in ('board', 'school', 'education_portal')
  ),
  trust_level text not null default 'review'
    check (trust_level in ('official', 'trusted', 'review')),
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

drop policy if exists qb_paper_discovery_sources_admin_all
  on public.qb_paper_discovery_sources;
create policy qb_paper_discovery_sources_admin_all
on public.qb_paper_discovery_sources
for all to authenticated
using (public.qb_my_role() = 'Admin')
with check (public.qb_my_role() = 'Admin');

-- Search results remain candidates until an administrator explicitly imports them.
-- They are never visible through the published Past Papers catalogue.
create table if not exists public.qb_paper_discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  discovery_run_id uuid,
  source_id uuid references public.qb_paper_discovery_sources(id) on delete set null,
  source_type text not null check (source_type in ('board', 'school')),
  title text not null check (length(btrim(title)) between 2 and 500),
  source_url text not null check (length(btrim(source_url)) between 8 and 2048),
  pdf_url text check (pdf_url is null or length(btrim(pdf_url)) between 8 and 2048),
  board_name text,
  school_id uuid references public.qb_schools(id) on delete restrict,
  discovered_school_name text,
  class_label text,
  subject_name text,
  year integer check (year is null or year between 1900 and 2200),
  exam_type text,
  medium text,
  verification_status text not null default 'unverified'
    check (verification_status in (
      'unverified', 'verified', 'inaccessible', 'unsafe_url',
      'invalid_pdf', 'duplicate'
    )),
  status text not null default 'discovered'
    check (status in (
      'discovered', 'needs_review', 'approved_for_import',
      'imported', 'rejected', 'duplicate', 'failed'
    )),
  checksum text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  duplicate_of_paper_id uuid references public.qb_source_papers(id) on delete set null,
  imported_paper_id uuid references public.qb_source_papers(id) on delete set null,
  rejection_reason text,
  discovery_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(discovery_metadata) = 'object'),
  discovered_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_paper_discovery_candidate_source_check check (
    (source_type = 'board' and school_id is null)
    or source_type = 'school'
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
  where source_type = 'school';

create index if not exists qb_paper_discovery_candidates_checksum_idx
  on public.qb_paper_discovery_candidates (checksum)
  where checksum is not null;

alter table public.qb_paper_discovery_candidates enable row level security;
revoke all on public.qb_paper_discovery_candidates from anon, authenticated;
grant select, update on public.qb_paper_discovery_candidates to authenticated;

drop policy if exists qb_paper_discovery_candidates_admin_read
  on public.qb_paper_discovery_candidates;
create policy qb_paper_discovery_candidates_admin_read
on public.qb_paper_discovery_candidates
for select to authenticated
using (public.qb_my_role() = 'Admin');

drop policy if exists qb_paper_discovery_candidates_admin_update
  on public.qb_paper_discovery_candidates;
create policy qb_paper_discovery_candidates_admin_update
on public.qb_paper_discovery_candidates
for update to authenticated
using (public.qb_my_role() = 'Admin')
with check (public.qb_my_role() = 'Admin');

-- Teachers may suggest new school names, but cannot create or edit canonical
-- directory entries. Admins review suggestions and add accepted names to qb_schools.
create table if not exists public.qb_school_suggestions (
  id uuid primary key default gen_random_uuid(),
  school_name text not null check (length(btrim(school_name)) between 2 and 200),
  normalized_name text generated always as (
    lower(regexp_replace(btrim(school_name), '[[:space:]]+', ' ', 'g'))
  ) stored,
  suggested_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'accepted', 'rejected')),
  linked_school_id uuid references public.qb_schools(id) on delete set null,
  admin_notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint qb_school_suggestions_accept_link_check check (
    status <> 'accepted' or linked_school_id is not null
  )
);

create unique index if not exists qb_school_suggestions_pending_name_uidx
  on public.qb_school_suggestions (normalized_name)
  where status = 'pending_review';

create index if not exists qb_school_suggestions_status_created_idx
  on public.qb_school_suggestions (status, created_at desc);

create index if not exists qb_school_suggestions_suggested_by_idx
  on public.qb_school_suggestions (suggested_by, created_at desc);

alter table public.qb_school_suggestions enable row level security;
revoke all on public.qb_school_suggestions from anon, authenticated;
grant select, insert, update on public.qb_school_suggestions to authenticated;

drop policy if exists qb_school_suggestions_read
  on public.qb_school_suggestions;
create policy qb_school_suggestions_read
on public.qb_school_suggestions
for select to authenticated
using (
  public.qb_my_role() = 'Admin'
  or (
    public.qb_my_role() = 'Teacher'
    and public.qb_my_qb_access()
    and suggested_by = auth.uid()
  )
);

drop policy if exists qb_school_suggestions_teacher_insert
  on public.qb_school_suggestions;
create policy qb_school_suggestions_teacher_insert
on public.qb_school_suggestions
for insert to authenticated
with check (
  public.qb_my_role() = 'Teacher'
  and public.qb_my_qb_access()
  and suggested_by = auth.uid()
  and status = 'pending_review'
  and linked_school_id is null
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists qb_school_suggestions_admin_update
  on public.qb_school_suggestions;
create policy qb_school_suggestions_admin_update
on public.qb_school_suggestions
for update to authenticated
using (public.qb_my_role() = 'Admin')
with check (public.qb_my_role() = 'Admin');

comment on table public.qb_paper_discovery_sources is
  'Admin-managed domains used to prioritize and classify online Past Paper discovery.';
comment on table public.qb_paper_discovery_candidates is
  'Unpublished online paper candidates awaiting verification, review and explicit import.';
comment on table public.qb_school_suggestions is
  'Teacher-submitted school names awaiting Admin review before entering qb_schools.';
