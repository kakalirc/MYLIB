-- QB paper extraction safety gate and durable per-paper run ledger.
-- This migration is intentionally additive. It does not invoke an AI provider.

create table if not exists public.qb_paper_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  source_paper_id uuid not null references public.qb_source_papers(id) on delete restrict,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'uncertain')),
  ai_request_state text not null default 'not_sent'
    check (ai_request_state in ('not_sent', 'sent', 'responded', 'uncertain')),
  pdf_sha256 text,
  model_name text,
  prompt_version text,
  schema_version text,
  linked_question_count_at_start integer not null default 0,
  linked_question_count_at_end integer,
  duplicate_question_count integer not null default 0,
  request_id text,
  input_tokens bigint,
  output_tokens bigint,
  estimated_cost_usd numeric(12,6),
  actual_cost_usd numeric(12,6),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint qb_paper_extraction_runs_sha256_format
    check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists qb_paper_extraction_runs_source_started_idx
  on public.qb_paper_extraction_runs (source_paper_id, started_at desc);

create unique index if not exists qb_paper_extraction_runs_one_active_per_paper
  on public.qb_paper_extraction_runs (source_paper_id)
  where status in ('queued', 'processing', 'uncertain');

alter table public.qb_paper_extraction_runs enable row level security;
revoke all on public.qb_paper_extraction_runs from public, anon, authenticated;
grant select, insert, update on public.qb_paper_extraction_runs to service_role;

comment on table public.qb_paper_extraction_runs is
  'Durable audit and idempotency ledger for AI extraction of QB source papers. A run is claimed before any provider request.';
comment on column public.qb_paper_extraction_runs.ai_request_state is
  'not_sent means retry is safe; sent/uncertain means do not automatically retry; responded means provider response was received and must be reused.';

create or replace function public.qb_begin_paper_extraction(
  p_source_paper_id uuid,
  p_requested_by uuid,
  p_pdf_sha256 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_paper public.qb_source_papers%rowtype;
  v_linked_count integer := 0;
  v_existing_run public.qb_paper_extraction_runs%rowtype;
  v_duplicate_paper public.qb_source_papers%rowtype;
  v_duplicate_run_id uuid;
  v_run_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'This extraction gate may only be called by the trusted server';
  end if;

  if p_requested_by is null or not exists (
    select 1 from public.profiles p
     where p.id = p_requested_by
       and p.role = 'Admin'
       and coalesce(p.archived, false) = false
  ) then
    return jsonb_build_object('ok', false, 'code', 'admin_required',
      'message', 'An active Admin must initiate extraction. No AI request was made.');
  end if;

  if p_source_paper_id is null then
    return jsonb_build_object('ok', false, 'code', 'missing_paper_id',
      'message', 'Select a source paper first. No AI request was made.');
  end if;

  if p_pdf_sha256 is not null and lower(trim(p_pdf_sha256)) !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_checksum',
      'message', 'The PDF checksum could not be verified. No AI request was made.');
  end if;

  select * into v_paper
    from public.qb_source_papers
   where id = p_source_paper_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'paper_not_found',
      'message', 'The selected source paper no longer exists. No AI request was made.');
  end if;

  if v_paper.status <> 'published' then
    return jsonb_build_object('ok', false, 'code', 'paper_not_published',
      'message', 'Only a published source paper can be extracted. No AI request was made.',
      'paper_status', v_paper.status);
  end if;

  if coalesce(v_paper.stored_pdf_url, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'pdf_missing',
      'message', 'This source paper has no stored PDF. No AI request was made.');
  end if;

  select count(*)::integer into v_linked_count
    from public.qb_questions
   where source_paper_id = p_source_paper_id;

  if v_paper.extraction_status = 'extracted' or v_linked_count > 0 then
    return jsonb_build_object('ok', false, 'code', 'already_extracted',
      'message', format('Already extracted into Question Bank — %s question records are linked. AI extraction will not run; no AI credits will be used.', v_linked_count),
      'linked_question_count', v_linked_count,
      'extraction_status', v_paper.extraction_status);
  end if;

  -- Any earlier provider attempt blocks a new run, even if a newer safe
  -- failed-before-send run happens to be the most recent row.
  select * into v_existing_run
    from public.qb_paper_extraction_runs
   where source_paper_id = p_source_paper_id
     and (
       status in ('queued', 'processing', 'completed', 'uncertain')
       or ai_request_state in ('sent', 'responded', 'uncertain')
     )
   order by started_at desc
   limit 1;

  if found then
    return jsonb_build_object('ok', false, 'code', 'prior_extraction_run',
      'message', 'A previous extraction attempt exists. It must be inspected or reconciled before another AI request. No AI request was made.',
      'run_id', v_existing_run.id,
      'run_status', v_existing_run.status,
      'ai_request_state', v_existing_run.ai_request_state,
      'linked_question_count', v_linked_count);
  end if;

  if p_pdf_sha256 is not null then
    -- Serialize claims for identical bytes across different source-paper rows.
    -- The per-paper row lock alone cannot prevent two papers with the same PDF
    -- from being claimed concurrently.
    perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_pdf_sha256)), 0));

    -- If this paper already has a stored checksum, it must agree with the
    -- checksum computed from the actual PDF bytes by the trusted Edge Function.
    if coalesce(v_paper.checksum, '') <> ''
       and lower(trim(v_paper.checksum)) <> lower(trim(p_pdf_sha256)) then
      return jsonb_build_object('ok', false, 'code', 'paper_checksum_mismatch',
        'message', 'The stored checksum does not match the PDF bytes. Verify the source file before extraction; no AI request was made.');
    end if;

    -- Check registered source-paper checksums, regardless of extraction status.
    select * into v_duplicate_paper
      from public.qb_source_papers
     where id <> p_source_paper_id
       and lower(checksum) = lower(trim(p_pdf_sha256))
     limit 1;

    if found then
      return jsonb_build_object('ok', false, 'code', 'exact_pdf_duplicate',
        'message', 'This PDF is an exact byte-for-byte match for another registered source paper. Extraction is blocked to prevent a duplicate AI charge.',
        'duplicate_source_paper_id', v_duplicate_paper.id,
        'duplicate_extraction_status', v_duplicate_paper.extraction_status,
        'duplicate_year', v_duplicate_paper.year,
        'duplicate_subject', v_duplicate_paper.subject_name);
    end if;

    -- Older extraction runs may have a checksum even when the source-paper
    -- upload record does not. Treat a prior provider attempt as a duplicate too.
    select r.id, p
      into v_duplicate_run_id, v_duplicate_paper
      from public.qb_paper_extraction_runs r
      join public.qb_source_papers p on p.id = r.source_paper_id
     where r.source_paper_id <> p_source_paper_id
       and lower(r.pdf_sha256) = lower(trim(p_pdf_sha256))
       and (
         r.status in ('queued', 'processing', 'completed', 'uncertain')
         or r.ai_request_state in ('sent', 'responded', 'uncertain')
       )
     order by r.started_at desc
     limit 1;

    if found then
      return jsonb_build_object('ok', false, 'code', 'exact_pdf_duplicate',
        'message', 'This PDF matches a previous extraction run for another source paper. Extraction is blocked to prevent a duplicate AI charge.',
        'duplicate_source_paper_id', v_duplicate_paper.id,
        'duplicate_run_id', v_duplicate_run_id,
        'duplicate_extraction_status', v_duplicate_paper.extraction_status,
        'duplicate_year', v_duplicate_paper.year,
        'duplicate_subject', v_duplicate_paper.subject_name);
    end if;
  end if;

  insert into public.qb_paper_extraction_runs
    (source_paper_id, requested_by, status, ai_request_state, pdf_sha256, linked_question_count_at_start)
  values
    (p_source_paper_id, p_requested_by, 'queued', 'not_sent',
     lower(trim(p_pdf_sha256)), v_linked_count)
  returning id into v_run_id;

  -- Keep extraction lifecycle in the private run ledger. The existing source-paper
  -- audit trigger intentionally restricts direct status updates to Admin sessions.

  return jsonb_build_object('ok', true, 'code', 'claimed',
    'message', 'Paper passed the extraction safety checks and has been atomically claimed. The AI provider has not yet been called.',
    'run_id', v_run_id,
    'source_paper_id', p_source_paper_id,
    'linked_question_count', v_linked_count);
end;
$function$;

revoke all on function public.qb_begin_paper_extraction(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.qb_begin_paper_extraction(uuid, uuid, text) to service_role;

create or replace function public.qb_set_paper_extraction_run_state(
  p_run_id uuid,
  p_status text,
  p_ai_request_state text,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_run public.qb_paper_extraction_runs%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'This extraction state update may only be called by the trusted server';
  end if;

  if p_status is null or p_ai_request_state is null
     or p_status not in ('queued', 'processing', 'completed', 'failed', 'uncertain')
     or p_ai_request_state not in ('not_sent', 'sent', 'responded', 'uncertain') then
    raise exception 'Unsupported extraction state';
  end if;

  select * into v_run
    from public.qb_paper_extraction_runs
   where id = p_run_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'run_not_found');
  end if;

  if v_run.status in ('completed', 'failed', 'uncertain')
     and (p_status <> v_run.status or p_ai_request_state <> v_run.ai_request_state) then
    raise exception 'Terminal extraction runs are immutable; reconcile them through a separate Admin workflow';
  end if;

  if v_run.ai_request_state = 'not_sent' and p_ai_request_state = 'responded' then
    raise exception 'A provider response cannot be recorded before the request is marked sent';
  end if;
  if v_run.ai_request_state = 'responded' and p_ai_request_state <> 'responded' then
    raise exception 'A durably received provider response cannot be downgraded';
  end if;

  if p_status = 'completed' and p_ai_request_state <> 'responded' then
    raise exception 'A run cannot complete until the provider response has been durably received';
  end if;
  if p_status = 'failed' and p_ai_request_state in ('sent', 'uncertain') then
    raise exception 'A run with an ambiguous provider request must be marked uncertain, not failed';
  end if;

  if v_run.ai_request_state in ('sent', 'responded', 'uncertain')
     and p_ai_request_state = 'not_sent' then
    raise exception 'An AI request already started; request state cannot be reset to not_sent';
  end if;

  update public.qb_paper_extraction_runs
     set status = p_status,
         ai_request_state = p_ai_request_state,
         error_message = left(p_error_message, 2000),
         completed_at = case when p_status in ('completed', 'failed', 'uncertain') then now() else null end,
         updated_at = now()
   where id = p_run_id;

  -- Do not mutate qb_source_papers here: its existing audit trigger requires an
  -- authenticated Admin for updates. The run ledger is the authoritative status.

  return jsonb_build_object('ok', true, 'run_id', p_run_id,
    'status', p_status, 'ai_request_state', p_ai_request_state);
end;
$function$;

revoke all on function public.qb_set_paper_extraction_run_state(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.qb_set_paper_extraction_run_state(uuid, text, text, text) to service_role;
