-- USD-only pricing snapshot and per-paper spend guard for extraction.
alter table public.qb_paper_extraction_runs
  add column if not exists cost_currency text not null default 'USD',
  add column if not exists input_price_usd_per_million numeric(12,6),
  add column if not exists output_price_usd_per_million numeric(12,6),
  add column if not exists cost_budget_usd numeric(12,6),
  add column if not exists cost_budget_reserved_usd numeric(12,6) not null default 0,
  add column if not exists pricing_source text,
  add column if not exists pricing_checked_at timestamptz;

alter table public.qb_paper_extraction_requests
  add column if not exists input_cost_usd numeric(12,8),
  add column if not exists output_cost_usd numeric(12,8),
  add column if not exists total_cost_usd numeric(12,8);

alter table public.qb_paper_extraction_runs
  add constraint qb_paper_extraction_runs_cost_currency_usd
  check (cost_currency = 'USD');

comment on column public.qb_paper_extraction_runs.actual_cost_usd is
  'Actual Anthropic token cost in USD, computed from persisted provider usage and the run pricing snapshot.';
comment on column public.qb_paper_extraction_runs.cost_budget_usd is
  'Maximum permitted extraction spend for this paper, in USD. Default is configured by QB_EXTRACTION_BUDGET_USD (default 2.00).';
