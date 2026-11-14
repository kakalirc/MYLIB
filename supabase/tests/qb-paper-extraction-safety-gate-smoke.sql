-- QB extraction safety gate: schema and privilege smoke checks.
do $$
begin
  if to_regclass('public.qb_paper_extraction_runs') is null then
    raise exception 'Missing qb_paper_extraction_runs';
  end if;
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'qb_paper_extraction_runs'
      and c.relrowsecurity
  ) then
    raise exception 'RLS must be enabled on qb_paper_extraction_runs';
  end if;
  if to_regprocedure('public.qb_begin_paper_extraction(uuid,uuid,text)') is null then
    raise exception 'Missing qb_begin_paper_extraction RPC';
  end if;
  if has_function_privilege('anon', 'public.qb_begin_paper_extraction(uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.qb_begin_paper_extraction(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'Extraction claim RPC must not be executable by browser roles';
  end if;
  if not has_function_privilege('service_role', 'public.qb_begin_paper_extraction(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'Trusted server role must be able to execute extraction claim RPC';
  end if;
end $$;
