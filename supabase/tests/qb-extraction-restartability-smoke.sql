-- Schema smoke checks for durable extraction checkpoints.
do $$
begin
  if to_regclass('public.qb_paper_extraction_pages') is null then
    raise exception 'Missing qb_paper_extraction_pages';
  end if;
  if to_regclass('public.qb_paper_extraction_requests') is null then
    raise exception 'Missing qb_paper_extraction_requests';
  end if;
  if to_regclass('public.qb_paper_extraction_staging') is null then
    raise exception 'Missing qb_paper_extraction_staging';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='qb_paper_extraction_pages' and c.relrowsecurity
  ) or not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='qb_paper_extraction_requests' and c.relrowsecurity
  ) or not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='qb_paper_extraction_staging' and c.relrowsecurity
  ) then
    raise exception 'RLS must be enabled on all extraction checkpoint tables';
  end if;
  if has_table_privilege('anon','public.qb_paper_extraction_requests','SELECT')
     or has_table_privilege('authenticated','public.qb_paper_extraction_requests','SELECT')
     or has_table_privilege('anon','public.qb_paper_extraction_staging','SELECT')
     or has_table_privilege('authenticated','public.qb_paper_extraction_staging','SELECT') then
    raise exception 'Browser roles must not read provider payloads or staged extraction data directly';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname='qb_extraction_request_state_guard'
      and not tgisinternal
  ) then
    raise exception 'Missing provider request state guard trigger';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='qb_paper_extraction_pages_run_page_key'
  ) and not exists (
    select 1 from pg_constraint
    where conname='qb_paper_extraction_pages_run_id_page_number_key'
  ) then
    raise exception 'Missing unique run/page checkpoint key';
  end if;
end $$;
