create table if not exists public.ka_student_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_language_code text not null default 'en'
    check (preferred_language_code in ('en', 'hi', 'kn', 'sa')),
  updated_at timestamptz not null default now()
);

alter table public.ka_student_preferences enable row level security;
revoke all on table public.ka_student_preferences from anon, authenticated;
