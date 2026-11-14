-- Extraction worker leases. Reclaiming a lease never changes provider request state.
create or replace function public.qb_claim_extraction_worker(p_run_id uuid,p_lease_owner text,p_lease_seconds integer default 600)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.qb_paper_extraction_runs%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Trusted server only'; end if;
 if p_run_id is null or coalesce(trim(p_lease_owner),'')='' then raise exception 'Run and owner required'; end if;
 select * into v from public.qb_paper_extraction_runs where id=p_run_id for update;
 if not found then return jsonb_build_object('ok',false,'code','run_not_found'); end if;
 if v.status in ('completed','failed','uncertain') then return jsonb_build_object('ok',false,'code','run_terminal','status',v.status); end if;
 if v.lease_expires_at>now() and v.lease_owner is distinct from p_lease_owner then return jsonb_build_object('ok',false,'code','worker_busy','lease_expires_at',v.lease_expires_at); end if;
 update public.qb_paper_extraction_runs set status='processing',current_stage='page_extraction',lease_owner=p_lease_owner,
 lease_expires_at=now()+make_interval(secs=>greatest(60,least(coalesce(p_lease_seconds,600),900))),
 heartbeat_at=now(),updated_at=now(),resume_count=resume_count+case when heartbeat_at is null then 0 else 1 end where id=p_run_id;
 return jsonb_build_object('ok',true,'run_id',p_run_id);
end $$;
revoke all on function public.qb_claim_extraction_worker(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.qb_claim_extraction_worker(uuid,text,integer) to service_role;

create or replace function public.qb_release_extraction_worker(p_run_id uuid,p_lease_owner text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Trusted server only'; end if;
 update public.qb_paper_extraction_runs set lease_owner=null,lease_expires_at=null,heartbeat_at=now(),updated_at=now()
 where id=p_run_id and lease_owner=p_lease_owner;
 return found;
end $$;
revoke all on function public.qb_release_extraction_worker(uuid,text) from public,anon,authenticated;
grant execute on function public.qb_release_extraction_worker(uuid,text) to service_role;
