-- Restartable Question Bank extraction: durable page/chunk checkpoints and review staging.
-- Additive only. No provider calls, question publication, or production schema changes occur
-- until this migration is reviewed and explicitly applied.

alter table public.qb_paper_extraction_runs
  add column if not exists current_stage text not null default 'preflight'
    check (current_stage in ('preflight','pdf_inspection','page_planning','page_extraction','staging','review','publishing','finished','reconciliation')),
  add column if not exists heartbeat_at timestamptz,
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists resume_count integer not null default 0,
  add column if not exists last_checkpoint_at timestamptz;

comment on column public.qb_paper_extraction_runs.current_stage is
  'Durable workflow stage; UI must derive Resume/Reconcile action from stage and provider state.';
comment on column public.qb_paper_extraction_runs.heartbeat_at is
  'Last trusted worker heartbeat. A stale heartbeat permits lease recovery, not a new provider request.';
comment on column public.qb_paper_extraction_runs.lease_expires_at is
  'Worker lease expiry. Lease expiry never resets an AI request to not_sent.';

create table if not exists public.qb_paper_extraction_pages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.qb_paper_extraction_runs(id) on delete restrict,
  page_number integer not null check (page_number > 0),
  page_state text not null default 'pending'
    check (page_state in ('pending','processing','completed','failed','skipped')),
  page_kind text check (page_kind in ('digital','scanned','mixed','blank','unknown')),
  page_checksum text check (page_checksum is null or page_checksum ~ '^[0-9a-f]{64}$'),
  extracted_text text,
  page_metadata jsonb not null default '{}'::jsonb,
  error_message text,
  attempts integer not null default 0 check (attempts >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (run_id, page_number)
);
create index if not exists qb_paper_extraction_pages_run_state_idx
  on public.qb_paper_extraction_pages(run_id, page_state, page_number);

create table if not exists public.qb_paper_extraction_requests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.qb_paper_extraction_runs(id) on delete restrict,
  page_id uuid references public.qb_paper_extraction_pages(id) on delete restrict,
  chunk_key text not null,
  provider text not null,
  model_name text not null,
  idempotency_key text not null unique,
  request_state text not null default 'prepared'
    check (request_state in ('prepared','sent','responded','uncertain','failed_before_send')),
  request_payload jsonb not null,
  response_payload jsonb,
  provider_request_id text,
  input_tokens bigint,
  output_tokens bigint,
  estimated_cost_usd numeric(12,6),
  actual_cost_usd numeric(12,6),
  error_message text,
  prepared_at timestamptz not null default now(),
  sent_at timestamptz,
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (run_id, chunk_key),
  check ((request_state <> 'responded') or response_payload is not null),
  check ((request_state <> 'sent') or sent_at is not null)
);
create index if not exists qb_paper_extraction_requests_run_state_idx
  on public.qb_paper_extraction_requests(run_id, request_state);

create table if not exists public.qb_paper_extraction_staging (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.qb_paper_extraction_runs(id) on delete restrict,
  item_key text not null,
  item_kind text not null check (item_kind in ('question','passage','image','instruction','section')),
  page_number integer,
  original_number text,
  parent_item_key text,
  payload jsonb not null,
  content_fingerprint text not null,
  review_state text not null default 'pending'
    check (review_state in ('pending','approved','rejected','edited')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  published_question_id uuid references public.qb_questions(id) on delete restrict,
  published_passage_id uuid references public.qb_passages(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, item_key),
  check (published_question_id is null or item_kind = 'question'),
  check (published_passage_id is null or item_kind = 'passage')
);
create index if not exists qb_paper_extraction_staging_review_idx
  on public.qb_paper_extraction_staging(run_id, review_state, item_kind);
create index if not exists qb_paper_extraction_staging_fingerprint_idx
  on public.qb_paper_extraction_staging(run_id, content_fingerprint);

-- These tables contain source documents, provider payloads and draft questions.
-- Browser roles receive no direct access; all access must pass through trusted,
-- Admin-authenticated Edge Functions and explicit server-side validation.
alter table public.qb_paper_extraction_pages enable row level security;
alter table public.qb_paper_extraction_requests enable row level security;
alter table public.qb_paper_extraction_staging enable row level security;
revoke all on public.qb_paper_extraction_pages from public, anon, authenticated;
revoke all on public.qb_paper_extraction_requests from public, anon, authenticated;
revoke all on public.qb_paper_extraction_staging from public, anon, authenticated;
grant select, insert, update on public.qb_paper_extraction_pages to service_role;
grant select, insert, update on public.qb_paper_extraction_requests to service_role;
grant select, insert, update on public.qb_paper_extraction_staging to service_role;

comment on table public.qb_paper_extraction_pages is
  'One durable row per page; completed page output is reused after worker interruption.';
comment on table public.qb_paper_extraction_requests is
  'One durable row per provider chunk. sent/uncertain requests are never automatically resent; responded payloads are reused.';
comment on table public.qb_paper_extraction_staging is
  'Canonical staged extraction output and Admin review decisions. Publication links are persisted for idempotent reconciliation.';

-- Guard against accidentally declaring a request safely retryable after it may
-- have reached the provider. The only safe transition to failed_before_send is
-- from prepared, before a send timestamp exists.
create or replace function public.qb_guard_extraction_request_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'UPDATE' then
    if old.request_state in ('sent','responded','uncertain')
       and new.request_state in ('prepared','failed_before_send') then
      raise exception 'A provider request that may have been sent cannot be reset to a retryable state';
    end if;
    if old.request_state = 'responded'
       and (new.request_state <> 'responded' or new.response_payload is distinct from old.response_payload) then
      raise exception 'A persisted provider response is immutable';
    end if;
    if old.request_state = 'prepared' and new.request_state = 'failed_before_send'
       and old.sent_at is not null then
      raise exception 'A request with a send timestamp cannot be marked failed_before_send';
    end if;
  end if;
  if new.request_state in ('sent','uncertain','responded') and new.sent_at is null then
    raise exception 'A possibly sent provider request requires sent_at';
  end if;
  if new.request_state = 'responded' and new.response_payload is null then
    raise exception 'A responded provider request requires a persisted response payload';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists qb_extraction_request_state_guard on public.qb_paper_extraction_requests;
create trigger qb_extraction_request_state_guard
before insert or update on public.qb_paper_extraction_requests
for each row execute function public.qb_guard_extraction_request_state();

revoke all on function public.qb_guard_extraction_request_state() from public, anon, authenticated;
