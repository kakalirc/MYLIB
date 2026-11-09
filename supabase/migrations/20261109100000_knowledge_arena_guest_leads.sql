-- Knowledge Arena guest access, lead capture, activity and marketing promotions.
begin;

create table if not exists public.ka_guest_leads (
  id uuid primary key default gen_random_uuid(),
  mobile_e164 text not null unique,
  last_guest_name text,
  last_grade_label text,
  enquiry_consent boolean not null default false,
  marketing_consent boolean not null default false,
  lead_status text not null default 'New'
    check (lead_status in ('New','Contacted','Interested','Demo Booked','Demo Completed','Converted to Student','Not Interested')),
  converted_student_id uuid references public.students(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_activity_at timestamptz,
  games_completed bigint not null default 0 check (games_completed >= 0),
  questions_answered bigint not null default 0 check (questions_answered >= 0),
  last_game_type text,
  last_subject text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ka_guest_leads_mobile_e164_check check (mobile_e164 ~ '^\+91[6-9][0-9]{9}$')
);

create table if not exists public.ka_guest_sessions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.ka_guest_leads(id) on delete cascade,
  session_token_hash text not null unique,
  guest_name text not null,
  grade_label text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  games_completed bigint not null default 0 check (games_completed >= 0),
  questions_answered bigint not null default 0 check (questions_answered >= 0),
  last_game_type text,
  last_subject text
);

create table if not exists public.ka_guest_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.ka_guest_leads(id) on delete cascade,
  session_id uuid not null references public.ka_guest_sessions(id) on delete cascade,
  client_attempt_id uuid not null,
  game_type text not null,
  subject text,
  question_count integer not null check (question_count > 0),
  correct_count integer not null check (correct_count >= 0 and correct_count <= question_count),
  accuracy numeric(5,2) not null check (accuracy >= 0 and accuracy <= 100),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  completed_at timestamptz not null default now(),
  constraint ka_guest_activity_attempt_unique unique (session_id, client_attempt_id)
);

create table if not exists public.ka_guest_consents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.ka_guest_leads(id) on delete cascade,
  session_id uuid references public.ka_guest_sessions(id) on delete set null,
  consent_type text not null check (consent_type in ('enquiry','whatsapp_marketing')),
  granted boolean not null,
  source text not null default 'knowledge_arena_guest',
  recorded_at timestamptz not null default now()
);

create table if not exists public.ka_guest_lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.ka_guest_leads(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  note text not null check (length(note) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.ka_guest_promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 500),
  image_url text,
  cta_label text not null default 'Explore courses' check (length(cta_label) between 1 and 50),
  cta_url text not null,
  trigger text not null check (trigger in ('welcome','after_game','exit')),
  target_grades text[] not null default '{}',
  target_game_types text[] not null default '{}',
  target_subjects text[] not null default '{}',
  display_order integer not null default 100,
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ka_guest_promotions_cta_url_check check (cta_url ~ '^https://')
);

create table if not exists public.ka_guest_promotion_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.ka_guest_leads(id) on delete cascade,
  session_id uuid not null references public.ka_guest_sessions(id) on delete cascade,
  promotion_id uuid not null references public.ka_guest_promotions(id) on delete cascade,
  event_type text not null check (event_type in ('view','click','dismiss')),
  created_at timestamptz not null default now()
);

create index if not exists ka_guest_sessions_lead_idx on public.ka_guest_sessions(lead_id, started_at desc);
create index if not exists ka_guest_sessions_expiry_idx on public.ka_guest_sessions(expires_at) where ended_at is null;
create index if not exists ka_guest_activity_lead_idx on public.ka_guest_activity(lead_id, completed_at desc);
create index if not exists ka_guest_activity_session_idx on public.ka_guest_activity(session_id, completed_at desc);
create index if not exists ka_guest_consents_lead_idx on public.ka_guest_consents(lead_id, recorded_at desc);
create index if not exists ka_guest_notes_lead_idx on public.ka_guest_lead_notes(lead_id, created_at desc);
create index if not exists ka_guest_promotion_events_promotion_idx on public.ka_guest_promotion_events(promotion_id, event_type, created_at desc);
create index if not exists ka_guest_leads_status_idx on public.ka_guest_leads(lead_status, last_seen_at desc);

create or replace function public.ka_guest_activity_rollup()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.ka_guest_sessions
    set games_completed = games_completed + 1,
        questions_answered = questions_answered + new.question_count,
        last_game_type = new.game_type,
        last_subject = new.subject,
        last_seen_at = new.completed_at
    where id = new.session_id;
  update public.ka_guest_leads
    set games_completed = games_completed + 1,
        questions_answered = questions_answered + new.question_count,
        last_game_type = new.game_type,
        last_subject = new.subject,
        last_activity_at = new.completed_at,
        last_seen_at = new.completed_at,
        updated_at = now()
    where id = new.lead_id;
  return new;
end;
$$;

drop trigger if exists ka_guest_activity_rollup_trg on public.ka_guest_activity;
create trigger ka_guest_activity_rollup_trg
after insert on public.ka_guest_activity
for each row execute function public.ka_guest_activity_rollup();

revoke all on function public.ka_guest_activity_rollup() from public, anon, authenticated;


insert into public.ka_guest_promotions (title, body, cta_label, cta_url, trigger, display_order, active)
select v.title, v.body, v.cta_label, v.cta_url, v.trigger, v.display_order, true
from (values
  ('Welcome to LIB Education', 'Enjoy Knowledge Arena? Explore personalised tuition in languages, Mathematics and Science, with online and offline learning options.', 'Explore our courses', 'https://www.libeducation.com/services', 'welcome', 10),
  ('Take your learning further', 'Build confidence with expert-led tuition, small groups and individual attention. Find the right programme for your learning goals.', 'Book a Demo', 'https://www.libeducation.com/demo', 'after_game', 10),
  ('Keep learning with LIB', 'Discover academic tuition and spoken language programmes at LIB Education. Your next learning goal starts here.', 'Book a Demo', 'https://www.libeducation.com/demo', 'exit', 10)
) as v(title, body, cta_label, cta_url, trigger, display_order)
where not exists (select 1 from public.ka_guest_promotions p where p.trigger = v.trigger and p.title = v.title);

alter table public.ka_guest_leads enable row level security;
alter table public.ka_guest_sessions enable row level security;
alter table public.ka_guest_activity enable row level security;
alter table public.ka_guest_consents enable row level security;
alter table public.ka_guest_lead_notes enable row level security;
alter table public.ka_guest_promotions enable row level security;
alter table public.ka_guest_promotion_events enable row level security;

revoke all on public.ka_guest_leads, public.ka_guest_sessions, public.ka_guest_activity,
  public.ka_guest_consents, public.ka_guest_lead_notes, public.ka_guest_promotions,
  public.ka_guest_promotion_events from anon, authenticated;
grant all on public.ka_guest_leads, public.ka_guest_sessions, public.ka_guest_activity,
  public.ka_guest_consents, public.ka_guest_lead_notes, public.ka_guest_promotions,
  public.ka_guest_promotion_events to service_role;

commit;
