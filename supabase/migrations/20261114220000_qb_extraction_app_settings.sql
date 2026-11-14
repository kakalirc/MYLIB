-- Admin-managed Question Bank extraction controls. No Edge Function secrets required.
create table if not exists public.qb_paper_extraction_settings (id integer primary key default 1 check (id = 1), max_pdf_mb integer not null default 20 check (max_pdf_mb between 1 and 100), max_pages integer not null default 25 check (max_pages between 1 and 200), budget_usd numeric(10,2) not null default 2.00 check (budget_usd > 0 and budget_usd <= 1000), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id));
insert into public.qb_paper_extraction_settings (id,max_pdf_mb,max_pages,budget_usd) values (1,20,25,2.00) on conflict (id) do nothing;
alter table public.qb_paper_extraction_settings enable row level security;
revoke all on public.qb_paper_extraction_settings from anon, authenticated;
grant all on public.qb_paper_extraction_settings to service_role;
comment on table public.qb_paper_extraction_settings is 'Server-enforced Admin-configurable Question Bank PDF extraction limits; changed only through the Admin-authenticated extraction review endpoint.';
