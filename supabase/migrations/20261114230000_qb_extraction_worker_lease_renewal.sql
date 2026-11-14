-- Safe heartbeat renewal for long-running extraction workers.
-- An expired lease cannot be resurrected by its former owner.
create or replace function public.qb_renew_extraction_worker(
 p_run_id uuid,
 p_lease_owner text,
 p_lease_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v public.qb_paper_extraction_runs%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Trusted server only'; end if;
 if p_run_id is null or coalesce(trim(p_lease_owner),'')='' then raise exception 'Run and owner required'; end if;
 select * into v from public.qb_paper_extraction_runs where id=p_run_id for update;
 if not found or v.status<>'processing' or v.lease_owner is distinct from p_lease_owner
    or v.lease_expires_at is null or v.lease_expires_at<=now() then
   return false;
 end if;
 update public.qb_paper_extraction_runs
 set lease_expires_at=now()+make_interval(secs=>greatest(60,least(coalesce(p_lease_seconds,900),900))),
     heartbeat_at=now(),updated_at=now()
 where id=p_run_id and lease_owner=p_lease_owner;
 return found;
end;
$$;
revoke all on function public.qb_renew_extraction_worker(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.qb_renew_extraction_worker(uuid,text,integer) to service_role;
comment on function public.qb_renew_extraction_worker(uuid,text,integer) is
 'Extends only the current unexpired processing lease. A former owner cannot resurrect an expired or replaced lease.';
