-- A stale worker must not fail a run after another worker has acquired its lease.
create or replace function public.qb_fail_extraction_worker_if_owner(
 p_run_id uuid,
 p_lease_owner text,
 p_error_message text
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Trusted server only'; end if;
 update public.qb_paper_extraction_runs
 set status='failed',ai_request_state='not_sent',error_message=left(coalesce(p_error_message,'Worker failed before provider send'),1800),
     lease_owner=null,lease_expires_at=null,heartbeat_at=now(),updated_at=now()
 where id=p_run_id and status='processing' and ai_request_state='not_sent'
   and lease_owner=p_lease_owner and lease_expires_at>now();
 return found;
end;
$$;
revoke all on function public.qb_fail_extraction_worker_if_owner(uuid,text,text) from public,anon,authenticated;
grant execute on function public.qb_fail_extraction_worker_if_owner(uuid,text,text) to service_role;
comment on function public.qb_fail_extraction_worker_if_owner(uuid,text,text) is
 'Marks a pre-send worker failure only while the same unexpired lease owner still controls the run.';
