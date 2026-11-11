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
grant select, insert, update, delete on public.demo_control_followups to authenticated;
drop policy if exists "Admins manage demo control followups" on public.demo_control_followups;
create policy "Admins manage demo control followups" on public.demo_control_followups
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin' and coalesce(p.archived,false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin' and coalesce(p.archived,false) = false));
create index if not exists demo_control_followups_next_idx on public.demo_control_followups(next_followup_at);

-- Immutable event trail for demo scheduling, teacher assignment and status changes.
create table if not exists public.demo_control_activity (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('wix','demo','ka')),
  source_id uuid not null,
  event_type text not null,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
alter table public.demo_control_activity enable row level security;
grant select on public.demo_control_activity to authenticated;
drop policy if exists "Admins read demo control activity" on public.demo_control_activity;
create policy "Admins read demo control activity" on public.demo_control_activity
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin' and coalesce(p.archived,false) = false));

create or replace function public.capture_demo_control_activity()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  old_json jsonb;
  new_json jsonb;
  src text;
  rid uuid;
  evt text := 'updated';
begin
  if TG_OP = 'INSERT' then
    old_json := null;
    new_json := to_jsonb(NEW);
    evt := 'created';
  else
    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);
    if old_json->>'status' is distinct from new_json->>'status' then
      evt := 'status_changed';
    elsif old_json->>'scheduled_date' is distinct from new_json->>'scheduled_date'
       or old_json->>'scheduled_time' is distinct from new_json->>'scheduled_time'
       or old_json->>'scheduled_teacher_id' is distinct from new_json->>'scheduled_teacher_id'
       or old_json->>'date' is distinct from new_json->>'date'
       or old_json->>'teacher_id' is distinct from new_json->>'teacher_id' then
      evt := 'schedule_changed';
    end if;
  end if;
  src := case TG_TABLE_NAME when 'wix_demo_bookings' then 'wix' when 'ka_guest_leads' then 'ka' else 'demo' end;
  rid := (new_json->>'id')::uuid;
  if TG_OP = 'INSERT' or old_json is distinct from new_json then
    insert into public.demo_control_activity(source_type,source_id,event_type,old_data,new_data,changed_by)
    values (src,rid,evt,old_json,new_json,auth.uid());
  end if;
  return NEW;
end;
$$;

drop trigger if exists demo_control_activity_demo_logs on public.demo_logs;
create trigger demo_control_activity_demo_logs after insert or update on public.demo_logs
  for each row execute function public.capture_demo_control_activity();
drop trigger if exists demo_control_activity_wix_bookings on public.wix_demo_bookings;
create trigger demo_control_activity_wix_bookings after insert or update on public.wix_demo_bookings
  for each row execute function public.capture_demo_control_activity();
drop trigger if exists demo_control_activity_ka_guest_leads on public.ka_guest_leads;
create trigger demo_control_activity_ka_guest_leads after insert or update on public.ka_guest_leads
  for each row execute function public.capture_demo_control_activity();
