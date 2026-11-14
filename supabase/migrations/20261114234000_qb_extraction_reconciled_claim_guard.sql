-- Allow a new extraction only after an Admin has explicitly reconciled the prior ambiguous attempt.
-- The old run/request rows remain untouched for audit; this does not resend the old request.
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
  v_duplicate_source_paper_id uuid;
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
     and admin_reconciled_at is null
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
    select r.id, p.id
      into v_duplicate_run_id, v_duplicate_source_paper_id
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
      select * into v_duplicate_paper from public.qb_source_papers where id = v_duplicate_source_paper_id;
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

comment on function public.qb_begin_paper_extraction(uuid,uuid,text) is
  'Atomically claims a source paper; prior provider attempts block retries unless an Admin explicitly reconciled that specific run.';

-- A reconciled uncertain run must no longer occupy the one-active-run slot.
drop index if exists public.qb_paper_extraction_runs_one_active_per_paper;
create unique index qb_paper_extraction_runs_one_active_per_paper
  on public.qb_paper_extraction_runs (source_paper_id)
  where status in ('queued', 'processing', 'uncertain')
    and admin_reconciled_at is null;
