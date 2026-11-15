-- Permit controlled continuation of legacy uncertain runs when pending pages remain.
-- The uncertain provider request stays immutable and is never resent.
create or replace function public.qb_claim_extraction_worker(
 p_run_id uuid,p_lease_owner text,p_lease_seconds integer default 600
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v public.qb_paper_extraction_runs%rowtype;
 v_has_uncertain boolean;
 v_has_pending boolean;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Trusted server only'; end if;
 if p_run_id is null or coalesce(trim(p_lease_owner),'')='' then raise exception 'Run and owner required'; end if;
 select * into v from public.qb_paper_extraction_runs where id=p_run_id for update;
 if not found then return jsonb_build_object('ok',false,'code','run_not_found'); end if;
 if v.status in ('completed','failed') then return jsonb_build_object('ok',false,'code','run_terminal','status',v.status); end if;
 if v.status='uncertain' then
   select exists(select 1 from public.qb_paper_extraction_requests where run_id=p_run_id and request_state='uncertain')
     into v_has_uncertain;
   select exists(select 1 from public.qb_paper_extraction_pages where run_id=p_run_id and page_state='pending')
     into v_has_pending;
   if not v_has_uncertain or not v_has_pending then
     return jsonb_build_object('ok',false,'code','run_requires_admin_reconciliation','status',v.status);
   end if;
 end if;
 if v.lease_expires_at>now() and v.lease_owner is distinct from p_lease_owner then
   return jsonb_build_object('ok',false,'code','worker_busy','lease_expires_at',v.lease_expires_at);
 end if;
 update public.qb_paper_extraction_runs set status='processing',current_stage='page_extraction',lease_owner=p_lease_owner,
 lease_expires_at=now()+make_interval(secs=>greatest(60,least(coalesce(p_lease_seconds,600),900))),
 heartbeat_at=now(),updated_at=now(),resume_count=resume_count+case when heartbeat_at is null then 0 else 1 end where id=p_run_id;
 return jsonb_build_object('ok',true,'run_id',p_run_id,'resumed_uncertain',v.status='uncertain');
end $$;
revoke all on function public.qb_claim_extraction_worker(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.qb_claim_extraction_worker(uuid,text,integer) to service_role;
comment on function public.qb_claim_extraction_worker(uuid,text,integer) is
 'Lease claim supports safe continuation of legacy uncertain runs only when an uncertain request is preserved and pending page checkpoints remain; uncertain chunks are skipped, never resent.';
