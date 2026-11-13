begin;
create table public.ka_client_error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('Student','Teacher','Admin')),
  category text not null check (category in ('javascript','promise','usage_tracking')),
  message text not null check (char_length(message) between 1 and 1000),
  source text,
  line_number integer,
  column_number integer,
  stack text,
  created_at timestamptz not null default now()
);
create index ka_client_error_logs_created_idx on public.ka_client_error_logs (created_at desc);
create index ka_client_error_logs_user_created_idx on public.ka_client_error_logs (user_id, created_at desc);
create index ka_client_error_logs_category_created_idx on public.ka_client_error_logs (category, created_at desc);
alter table public.ka_client_error_logs enable row level security;
revoke all on public.ka_client_error_logs from anon, authenticated;
grant all on public.ka_client_error_logs to service_role;
comment on table public.ka_client_error_logs is 'Sanitised Knowledge Arena client diagnostics. Read/write only through the trusted Edge Function; Admin-only retrieval.';
commit;
