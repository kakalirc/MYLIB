-- Non-destructive fresh-run restart for Question Bank extraction.
-- A restart creates a new run and links it to the prior run. Existing run,
-- request, response, page, staging and accounting rows are never deleted/rewritten.
alter table public.qb_paper_extraction_runs
  add column if not exists restart_of_run_id uuid references public.qb_paper_extraction_runs(id),
  add column if not exists restart_reason text;

create index if not exists qb_paper_extraction_runs_restart_of_idx
  on public.qb_paper_extraction_runs(restart_of_run_id)
  where restart_of_run_id is not null;

create or replace function public.qb_restart_paper_extraction(
  p_source_paper_id uuid,
  p_requested_by uuid,
  p_pdf_sha256 text,
  p_previous_run_id uuid,
  p_restart_reason text default 'Admin requested a fresh extraction; prior run retained'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_paper public.qb_source_papers%rowtype;
  v_previous public.qb_paper_extraction_runs%rowtype;
  v_duplicate public.qb_source_papers%rowtype;
  v_duplicate_run uuid;
  v_linked integer := 0;
  v_run uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'This extraction gate may only be called by the trusted server';
  end if;
  if p_requested_by is null or not exists (
    select 1 from public.profiles
    where id = p_requested_by and role = 'Admin' and coalesce(archived,false)=false
  ) then
    return jsonb_build_object('ok',false,'code','admin_required','message','An active Admin must initiate the restart. No AI request was made.');
  end if;
  if p_source_paper_id is null or p_previous_run_id is null
     or coalesce(p_restart_reason,'') = '' or length(p_restart_reason) > 500
     or lower(coalesce(p_pdf_sha256,'')) !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'code','invalid_restart','message','A valid source, previous run, checksum and restart reason are required. No AI request was made.');
  end if;

  select * into v_paper from public.qb_source_papers
   where id=p_source_paper_id for update;
  if not found or v_paper.status <> 'published' or coalesce(v_paper.stored_pdf_url,'') = '' then
    return jsonb_build_object('ok',false,'code','paper_unavailable','message','The published source paper or stored PDF is unavailable. No AI request was made.');
  end if;

  select * into v_previous from public.qb_paper_extraction_runs
   where id=p_previous_run_id and source_paper_id=p_source_paper_id;
  if not found then
    return jsonb_build_object('ok',false,'code','previous_run_mismatch','message','The selected previous run does not belong to this source paper. No AI request was made.');
  end if;
  if v_previous.status in ('queued','processing') then
    return jsonb_build_object('ok',false,'code','run_still_active','message','The previous extraction is still active. Resume or wait for it to stop before starting a fresh run. No AI request was made.');
  end if;

  select count(*)::integer into v_linked from public.qb_questions where source_paper_id=p_source_paper_id;
  if v_paper.extraction_status='extracted' or v_linked>0 then
    return jsonb_build_object('ok',false,'code','already_extracted','message','Questions are already linked to this source paper. Review the existing Question Bank records before restarting. No AI request was made.','linked_question_count',v_linked);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_pdf_sha256)),0));
  if coalesce(v_paper.checksum,'') <> '' and lower(trim(v_paper.checksum)) <> lower(trim(p_pdf_sha256)) then
    return jsonb_build_object('ok',false,'code','paper_checksum_mismatch','message','The stored source checksum differs from the current PDF. No AI request was made.');
  end if;

  select * into v_duplicate from public.qb_source_papers
   where id<>p_source_paper_id and lower(checksum)=lower(trim(p_pdf_sha256)) limit 1;
  if found then
    return jsonb_build_object('ok',false,'code','exact_pdf_duplicate','message','This PDF is an exact match for another registered source paper. Restart is blocked to prevent cross-paper duplicate extraction. No AI request was made.','duplicate_source_paper_id',v_duplicate.id);
  end if;

  select r.id into v_duplicate_run
    from public.qb_paper_extraction_runs r
    join public.qb_source_papers p on p.id=r.source_paper_id
   where r.source_paper_id<>p_source_paper_id
     and lower(r.pdf_sha256)=lower(trim(p_pdf_sha256))
     and (r.status in ('queued','processing','completed','uncertain')
       or r.ai_request_state in ('sent','responded','uncertain'))
   order by r.started_at desc limit 1;
  if found then
    return jsonb_build_object('ok',false,'code','exact_pdf_duplicate','message','This PDF matches a prior extraction for another source paper. Restart is blocked to prevent duplicate extraction. No AI request was made.','duplicate_run_id',v_duplicate_run);
  end if;

  insert into public.qb_paper_extraction_runs
    (source_paper_id,requested_by,status,ai_request_state,pdf_sha256,
     linked_question_count_at_start,restart_of_run_id,restart_reason)
  values
    (p_source_paper_id,p_requested_by,'queued','not_sent',lower(trim(p_pdf_sha256)),
     v_linked,p_previous_run_id,left(trim(p_restart_reason),500))
  returning id into v_run;

  return jsonb_build_object('ok',true,'code','fresh_run_created',
    'message','A new independent extraction run was created. Previous history is unchanged; no provider request has been sent yet.',
    'run_id',v_run,'source_paper_id',p_source_paper_id,
    'restart_of_run_id',p_previous_run_id,'linked_question_count',v_linked);
end;
$function$;

revoke all on function public.qb_restart_paper_extraction(uuid,uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.qb_restart_paper_extraction(uuid,uuid,text,uuid,text) to service_role;
