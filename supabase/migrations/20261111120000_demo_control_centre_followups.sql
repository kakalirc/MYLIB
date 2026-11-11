-- Admin-only follow-up metadata for the unified Demo Control Centre.
-- Source records remain in their existing tables; this table stores only cross-source follow-up fields.
create table if not exists public.demo_control_followups (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('wix','demo','ka')),
  source_id uuid not null,
  note text not null default '',
  interest_level text check (interest_level is null or interest_level in ('High','Medium','Low','Not interested')),
  next_followup_at date,
  owner_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);
alter table public.demo_control_followups enable row level security;
drop policy if exists "Admins manage demo control followups" on public.demo_control_followups;
create policy "Admins manage demo control followups" on public.demo_control_followups
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin' and coalesce(p.archived,false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin' and coalesce(p.archived,false) = false));
create index if not exists demo_control_followups_next_idx on public.demo_control_followups(next_followup_at);
