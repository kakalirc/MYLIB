-- Persist non-fatal accounting warnings and permit safe later batches after an ambiguous chunk.
alter table public.qb_paper_extraction_runs
  add column if not exists accounting_warnings jsonb not null default '[]'::jsonb;

comment on column public.qb_paper_extraction_runs.accounting_warnings is
  'Accumulated non-fatal usage/cost reconciliation warnings across all worker invocations.';

create or replace function public.qb_set_extraction_worker_state(
  p_run_id uuid, p_lease_owner text, p_status text, p_ai_request_state text,
  p_error_message text default null
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare
  v_run public.qb_paper_extraction_runs%rowtype;
  v_sent_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Trusted server only'; end if;
  if p_run_id is null or coalesce(trim(p_lease_owner), '') = '' then raise exception 'Run and lease owner are required'; end if;
  if p_status is null or p_ai_request_state is null
     or p_status not in ('queued','processing','completed','uncertain','failed')
     or p_ai_request_state not in ('not_sent','sent','responded','uncertain') then
    raise exception 'Unsupported extraction state';
  end if;
  select * into v_run from public.qb_paper_extraction_runs where id=p_run_id for update;
  if not found then return jsonb_build_object('ok',false,'code','run_not_found'); end if;
  if v_run.status <> 'processing' or v_run.lease_owner is distinct from p_lease_owner
     or v_run.lease_expires_at is null or v_run.lease_expires_at <= now() then
    return jsonb_build_object('ok',false,'code','lease_not_owned');
  end if;
  if p_status not in ('processing','completed','uncertain','failed') then raise exception 'Worker cannot move a run to this status'; end if;
  if v_run.ai_request_state='not_sent' and p_ai_request_state='responded' then raise exception 'Provider response cannot precede sent state'; end if;
  if v_run.ai_request_state='responded' and p_ai_request_state='sent' then
    select count(*) into v_sent_count from public.qb_paper_extraction_requests where run_id=p_run_id and request_state='sent';
    if v_sent_count<>1 then raise exception 'Next batch requires exactly one durably recorded sent request'; end if;
    -- Existing uncertain rows are preserved as audit evidence and their pages are skipped.
    -- They do not prevent independent later chunks from being processed.
  end if;
  if v_run.ai_request_state='uncertain' and p_ai_request_state='sent' then
    select count(*) into v_sent_count from public.qb_paper_extraction_requests where run_id=p_run_id and request_state='sent';
    if v_sent_count<>1 then raise exception 'Resume after ambiguity requires exactly one newly sent request'; end if;
  end if;
  if v_run.ai_request_state in ('sent','responded','uncertain') and p_ai_request_state='not_sent' then raise exception 'Provider request state cannot be reset'; end if;
  if p_status='completed' and p_ai_request_state<>'responded' then raise exception 'Run cannot complete before provider response is persisted'; end if;
  if p_status='failed' and p_ai_request_state in ('sent','uncertain') then raise exception 'Ambiguous provider request must be marked uncertain'; end if;
  update public.qb_paper_extraction_runs set status=p_status,ai_request_state=p_ai_request_state,
    error_message=left(p_error_message,2000),
    completed_at=case when p_status in ('completed','failed','uncertain') then now() else null end,
    updated_at=now() where id=p_run_id;
  return jsonb_build_object('ok',true,'run_id',p_run_id,'status',p_status,'ai_request_state',p_ai_request_state);
end;
$function$;
revoke all on function public.qb_set_extraction_worker_state(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.qb_set_extraction_worker_state(uuid,text,text,text,text) to service_role;
comment on function public.qb_set_extraction_worker_state(uuid,text,text,text,text) is
 'Lease-owner guarded worker transition. Uncertain chunks remain immutable; later independent batches may proceed while their page checkpoints are skipped.';
