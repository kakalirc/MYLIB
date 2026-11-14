-- Trusted worker lease smoke checks. Run after all extraction migrations.
do $$
begin
 if to_regprocedure('public.qb_claim_extraction_worker(uuid,text,integer)') is null then
   raise exception 'Missing qb_claim_extraction_worker';
 end if;
 if to_regprocedure('public.qb_release_extraction_worker(uuid,text)') is null then
   raise exception 'Missing qb_release_extraction_worker';
 end if;
 if has_function_privilege('anon','public.qb_claim_extraction_worker(uuid,text,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.qb_claim_extraction_worker(uuid,text,integer)','EXECUTE') then
   raise exception 'Browser roles must not claim extraction leases';
 end if;
 if not has_function_privilege('service_role','public.qb_claim_extraction_worker(uuid,text,integer)','EXECUTE') then
   raise exception 'service_role must be able to claim extraction leases';
 end if;
 if not exists(select 1 from pg_trigger where tgname='qb_extraction_request_state_guard' and not tgisinternal) then
   raise exception 'Provider request state guard is missing';
 end if;
end $$;
