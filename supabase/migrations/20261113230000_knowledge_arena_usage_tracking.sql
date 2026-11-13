-- Track authenticated Knowledge Arena page visits.
-- Writes and reads are performed only by the trusted Edge Function service role.
create table public.ka_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null default 'arena_open' check (event_type = 'arena_open'),
  created_at timestamptz not null default now()
);

create index ka_usage_events_created_idx on public.ka_usage_events (created_at desc);
create index ka_usage_events_user_created_idx on public.ka_usage_events (user_id, created_at desc);

alter table public.ka_usage_events enable row level security;

comment on table public.ka_usage_events is
  'Authenticated Knowledge Arena page-open events. Read/write through the trusted Knowledge Arena Edge Function only.';
