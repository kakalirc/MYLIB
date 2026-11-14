-- Assert extraction ledger stores all cost and budget values in USD.
do $$
declare v_run uuid; v_paper uuid; v_admin uuid; v_grade uuid; v_board uuid;
begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='qb_paper_extraction_runs' and column_name='cost_currency') then
   raise exception 'Run currency snapshot column is missing';
 end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='qb_paper_extraction_runs' and column_name='input_price_usd_per_million') or
    not exists(select 1 from information_schema.columns where table_schema='public' and table_name='qb_paper_extraction_runs' and column_name='output_price_usd_per_million') or
    not exists(select 1 from information_schema.columns where table_schema='public' and table_name='qb_paper_extraction_runs' and column_name='cost_budget_usd') then
   raise exception 'USD pricing snapshot or budget columns are missing';
 end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='qb_paper_extraction_requests' and column_name='total_cost_usd') then
   raise exception 'Per-request USD cost column is missing';
 end if;
 if not exists(select 1 from pg_constraint where conname='qb_paper_extraction_runs_cost_currency_usd') then
   raise exception 'USD-only currency constraint is missing';
 end if;
end $$;
