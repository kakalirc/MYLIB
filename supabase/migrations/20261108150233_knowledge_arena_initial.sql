-- LIB Knowledge Arena: applied isolated production schema migration.
-- Creates only ka_* objects. Existing Question Bank, Online Assessment,
-- and attendance-gamification objects are not modified.

begin;

do $$
begin
  if exists (
      select 1 from pg_class c
      where c.relnamespace='public'::regnamespace and left(c.relname,3)='ka_'
    ) or exists (
      select 1 from pg_proc p
      where p.pronamespace='public'::regnamespace and left(p.proname,3)='ka_'
    ) or exists (
      select 1 from pg_type t
      where t.typnamespace='public'::regnamespace and left(t.typname,3)='ka_'
    ) or exists (
      select 1 from pg_trigger tr
      join pg_class c on c.oid=tr.tgrelid
      where c.relnamespace='public'::regnamespace and left(tr.tgname,3)='ka_'
    ) then
    raise exception 'A Knowledge Arena object name already exists. Stop and inspect before proceeding.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='id' and udt_name='uuid'
  ) then
    raise exception 'Preflight failed: public.profiles.id must be uuid.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='role'
  ) then
    raise exception 'Preflight failed: public.profiles.role is missing.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='linked_student_id'
  ) then
    raise exception 'Preflight failed: public.profiles.linked_student_id is missing.';
  end if;
  if to_regclass('public.students') is null
     or to_regclass('public.grades') is null
     or to_regclass('public.subjects') is null then
    raise exception 'Preflight failed: students, grades and subjects tables are required.';
  end if;
  if not exists (select 1 from public.profiles where role='Student') then
    raise exception 'Preflight failed: no exact Student role records were found.';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.role='Student'
      and (p.linked_student_id is null or not exists (
        select 1 from public.students st where st.id=p.linked_student_id
      ))
  ) then
    raise exception 'Preflight failed: one or more Student profiles have no linked student record.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='students' and column_name='id' and udt_name='uuid'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='students' and column_name='grade_id' and udt_name='uuid'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='grades' and column_name='id' and udt_name='uuid'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='linked_student_id' and udt_name='uuid'
  ) then
    raise exception 'Preflight failed: student/profile/grade identifiers must use the expected uuid types.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='students' and column_name='grade_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='grades' and column_name in ('id','name')
    group by table_name having count(distinct column_name)=2
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='subjects' and column_name='name'
  ) then
    raise exception 'Preflight failed: required student grade or subject columns are missing.';
  end if;
end $$;

create table public.ka_questions (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  topic text not null,
  grade_label text not null,
  language_code text not null default 'en',
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  game_type text not null check (game_type in ('word_master','number_quest','science_explorer','quick_quiz','brain_teaser','memory_challenge')),
  prompt text not null,
  prompt_hash text generated always as (md5(lower(regexp_replace(btrim(prompt), '[[:space:]]+', ' ', 'g')))) stored,
  options jsonb not null check (jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 6),
  explanation text not null,
  source_reference text,
  source_checked_at timestamptz,
  content_version integer not null default 1,
  status text not null default 'pending' check (status in ('pending','validated','published','disabled','expired','rejected')),
  generated_by text not null default 'ai',
  generation_job_id uuid,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  expires_at timestamptz,
  constraint ka_questions_published_has_date check (status <> 'published' or published_at is not null),
  constraint ka_questions_deduplicate unique (grade_label, subject, language_code, game_type, prompt_hash)
);

-- Answer keys are isolated from the student-readable question content.
-- Only trusted server-side code using the service role may access this table.
create table public.ka_question_keys (
  question_id uuid primary key references public.ka_questions(id) on delete cascade,
  correct_option smallint not null check (correct_option >= 0),
  updated_at timestamptz not null default now()
);

create table public.ka_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued' check (status in ('queued','running','completed','partial','failed','paused')),
  subject text,
  topic text,
  grade_label text,
  language_code text not null default 'en',
  game_type text not null check (game_type in ('word_master','number_quest','science_explorer','quick_quiz','brain_teaser','memory_challenge')),
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  requested_count integer not null check (requested_count between 1 and 500),
  generated_count integer not null default 0,
  validated_count integer not null default 0,
  published_count integer not null default 0,
  rejected_count integer not null default 0,
  model text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  estimated_cost_usd numeric(16,8) not null default 0,
  estimated_cost_inr numeric(16,6) not null default 0 check (estimated_cost_inr >= 0),
  usd_inr_rate numeric(12,6),
  worker_attempts integer not null default 0 check (worker_attempts >= 0),
  error_code text,
  error_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.ka_questions
  add constraint ka_questions_generation_job_fk
  foreign key (generation_job_id) references public.ka_generation_jobs(id) on delete set null;

-- Attempts persist aggregate results only. Individual answers and answer history are
-- evaluated in memory by the trusted API and are deliberately not stored.
create table public.ka_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_attempt_id uuid not null,
  game_type text not null check (game_type in ('word_master','number_quest','science_explorer','quick_quiz','brain_teaser','memory_challenge')),
  subject text,
  grade_label text,
  challenge_id uuid,
  question_count integer not null check (question_count > 0),
  correct_count integer not null check (correct_count between 0 and question_count),
  accuracy numeric(5,2) not null check (accuracy between 0 and 100),
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ka_attempts_client_id_unique unique (user_id,client_attempt_id)
);

create table public.ka_daily_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_date date not null,
  grade_label text not null,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','published','paused','expired')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint ka_daily_challenges_date_grade_unique unique (challenge_date, grade_label)
);

alter table public.ka_attempts
  add constraint ka_attempts_challenge_fk
  foreign key (challenge_id) references public.ka_daily_challenges(id) on delete set null;

create table public.ka_daily_challenge_items (
  challenge_id uuid not null references public.ka_daily_challenges(id) on delete cascade,
  question_id uuid not null references public.ka_questions(id) on delete restrict,
  sort_order integer not null check (sort_order > 0),
  primary key (challenge_id, question_id),
  unique (challenge_id, sort_order)
);

create table public.ka_player_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  game_xp bigint not null default 0 check (game_xp >= 0),
  games_played bigint not null default 0 check (games_played >= 0),
  questions_answered bigint not null default 0 check (questions_answered >= 0),
  correct_answers bigint not null default 0 check (correct_answers >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  last_played_on date,
  updated_at timestamptz not null default now(),
  check (correct_answers <= questions_answered)
);

create table public.ka_achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text not null,
  icon text,
  rule jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.ka_player_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.ka_achievements(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table public.ka_settings (
  id smallint primary key default 1 check (id=1),
  generation_enabled boolean not null default false,
  daily_challenge_enabled boolean not null default false,
  games_enabled boolean not null default true,
  disabled_game_types text[] not null default '{}'::text[],
  disabled_subjects text[] not null default '{}'::text[],
  daily_ai_budget_inr numeric(12,2) not null default 100 check (daily_ai_budget_inr >= 0),
  monthly_ai_budget_inr numeric(12,2) not null default 1000 check (monthly_ai_budget_inr >= 0),
  worker_lease_until timestamptz,
  worker_lease_token uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint ka_settings_daily_budget_not_above_monthly
    check (daily_ai_budget_inr <= monthly_ai_budget_inr)
);

insert into public.ka_settings (id) values (1) on conflict (id) do nothing;

create table public.ka_ai_usage (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ka_generation_jobs(id) on delete restrict,
  status text not null default 'reserved' check (status in ('reserved','settled','review')),
  reserved_cost_usd numeric(16,8) not null check (reserved_cost_usd >= 0),
  reserved_cost_inr numeric(16,6) not null check (reserved_cost_inr >= 0),
  actual_cost_usd numeric(16,8),
  actual_cost_inr numeric(16,6),
  usd_inr_rate numeric(12,6) not null check (usd_inr_rate > 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint ka_ai_usage_settled_has_actual_cost check (status <> 'settled' or actual_cost_inr is not null)
);

create index ka_ai_usage_created_idx on public.ka_ai_usage (created_at desc);
create index ka_ai_usage_job_idx on public.ka_ai_usage (job_id, created_at desc);

create index ka_questions_student_feed_idx
  on public.ka_questions (grade_label, subject, game_type, status, difficulty);
create index ka_questions_expiry_idx
  on public.ka_questions (expires_at) where status='published';
create index ka_attempts_user_completed_idx
  on public.ka_attempts (user_id, completed_at desc);
create index ka_attempts_completed_idx
  on public.ka_attempts (completed_at desc);
create index ka_generation_jobs_status_idx
  on public.ka_generation_jobs (status, created_at);
create index ka_daily_challenges_date_status_idx
  on public.ka_daily_challenges (challenge_date desc, status);

alter table public.ka_questions enable row level security;
alter table public.ka_question_keys enable row level security;
alter table public.ka_generation_jobs enable row level security;
alter table public.ka_attempts enable row level security;
alter table public.ka_daily_challenges enable row level security;
alter table public.ka_daily_challenge_items enable row level security;
alter table public.ka_player_stats enable row level security;
alter table public.ka_achievements enable row level security;
alter table public.ka_player_achievements enable row level security;
alter table public.ka_settings enable row level security;
alter table public.ka_ai_usage enable row level security;

-- Only authenticated student accounts with a linked LIB student record can read
-- published game prompts/options. Admin and teacher accounts do not get question text.
create policy ka_questions_student_read on public.ka_questions
for select to authenticated
using (
  status='published'
  and exists (
    select 1
    from public.profiles p
    join public.students st on st.id=p.linked_student_id
    left join public.grades g on g.id=st.grade_id
    where p.id=auth.uid() and p.role='Student'
      and p.linked_student_id is not null
      and (grade_label=coalesce(g.name,'General') or grade_label='General')
      and (expires_at is null or expires_at > now())
  )
);

-- No client policies are intentionally created for answer keys, generation jobs,
-- or settings. These remain server-role-only.
create policy ka_attempts_owner_read on public.ka_attempts
for select to authenticated
using (user_id=auth.uid());

create policy ka_daily_challenges_student_read on public.ka_daily_challenges
for select to authenticated
using (
  status='published'
  and exists (
    select 1 from public.profiles p
    join public.students st on st.id=p.linked_student_id
    left join public.grades g on g.id=st.grade_id
    where p.id=auth.uid() and p.role='Student' and p.linked_student_id is not null
      and ka_daily_challenges.grade_label=coalesce(g.name,'General')
  )
);

create policy ka_daily_items_student_read on public.ka_daily_challenge_items
for select to authenticated
using (
  exists (
    select 1
    from public.ka_daily_challenges d
    join public.profiles p on p.id=auth.uid()
    join public.students st on st.id=p.linked_student_id
    left join public.grades g on g.id=st.grade_id
    join public.ka_questions q on q.id=question_id
    where d.id=challenge_id and d.status='published'
      and p.role='Student' and p.linked_student_id is not null
      and d.grade_label=coalesce(g.name,'General')
      and q.grade_label=d.grade_label
      and q.status='published' and (q.expires_at is null or q.expires_at > now())
  )
);

-- The AI usage ledger contains cost and token accounting only. It is private to the worker.
create policy ka_player_stats_owner_read on public.ka_player_stats
for select to authenticated using (user_id=auth.uid());

create policy ka_achievements_student_read on public.ka_achievements
for select to authenticated
using (
  active=true
  and exists (
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='Student' and p.linked_student_id is not null
  )
);

create policy ka_player_achievements_owner_read on public.ka_player_achievements
for select to authenticated using (user_id=auth.uid());

-- Browser clients use the authenticated Edge Function API only. Do not grant
-- direct table reads: this prevents bypassing game/subject switches and keeps
-- the question/attempt surface behind one authorization and validation layer.


-- Trusted worker-only RPCs. These are deliberately unavailable to browser roles.
create or replace function public.ka_claim_generation_job(p_lease_token uuid)
returns setof public.ka_generation_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed public.ka_generation_jobs;
  lease_id smallint;
begin
  if coalesce(auth.role(),'') <> 'service_role' or p_lease_token is null then
    raise exception 'Not authorised';
  end if;

  -- The singleton settings row serialises budget reservations and paid provider calls.
  update public.ka_settings
     set worker_lease_until=now() + interval '10 minutes',
         worker_lease_token=p_lease_token
   where id=1 and (worker_lease_until is null or worker_lease_until <= now())
  returning id into lease_id;
  if lease_id is null then
    return;
  end if;

  -- Once a new worker acquires the expired singleton lease, any still-running
  -- job belongs to the previous worker and must be paused before another is claimed.
  update public.ka_generation_jobs
     set status='paused',
         error_code='worker_lease_expired',
         error_summary='Paused after the previous worker lease expired. Review reserved AI usage before resuming.',
         completed_at=now()
   where status='running';

  update public.ka_ai_usage u
     set status='review'
   where u.status='reserved'
     and exists (
       select 1 from public.ka_generation_jobs j
       where j.id=u.job_id and j.status='paused' and j.error_code='worker_lease_expired'
     );

  with next_job as (
    select id
    from public.ka_generation_jobs
    where status='queued'
    order by created_at
    limit 1
    for update skip locked
  )
  update public.ka_generation_jobs j
     set status='running',
         started_at=now(),
         worker_attempts=worker_attempts+1,
         error_code=null,
         error_summary=null,
         completed_at=null
    from next_job
   where j.id=next_job.id
  returning j.* into claimed;

  if claimed.id is not null then
    return next claimed;
    return;
  end if;

  update public.ka_settings
     set worker_lease_until=null, worker_lease_token=null
   where id=1 and worker_lease_token=p_lease_token;
  return;
end;
$$;

create or replace function public.ka_renew_worker_lease(p_lease_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' or p_lease_token is null then
    raise exception 'Not authorised';
  end if;
  update public.ka_settings
     set worker_lease_until=now() + interval '10 minutes'
   where id=1 and worker_lease_token=p_lease_token and worker_lease_until > now();
  get diagnostics changed = row_count;
  return changed=1;
end;
$$;

create or replace function public.ka_release_worker_lease(p_lease_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' or p_lease_token is null then
    raise exception 'Not authorised';
  end if;
  update public.ka_settings
     set worker_lease_until=null, worker_lease_token=null
   where id=1 and worker_lease_token=p_lease_token;
  get diagnostics changed = row_count;
  return changed=1;
end;
$$;

-- Publish a common daily challenge for every active grade band. Each grade gets
-- exactly ten questions; the competition leaderboard remains common across grades.
create or replace function public.ka_publish_daily_challenges(p_challenge_date date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  grade_row record;
  question_ids uuid[];
  challenge_id uuid;
  target_grade text;
  published_grades text[] := '{}'::text[];
  skipped_grades text[] := '{}'::text[];
  already_published_grades text[] := '{}'::text[];
  disabled_game_types text[] := '{}'::text[];
  disabled_subjects text[] := '{}'::text[];
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Not authorised';
  end if;
  if p_challenge_date is distinct from (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Only the current India-local date can be published';
  end if;
  select coalesce(s.disabled_game_types,'{}'::text[]), coalesce(s.disabled_subjects,'{}'::text[])
    into disabled_game_types, disabled_subjects
  from public.ka_settings s
  where s.id=1 and s.daily_challenge_enabled=true and s.games_enabled=true;
  if not found or 'quick_quiz'=any(disabled_game_types) then
    return jsonb_build_object('published_grades',published_grades,'skipped_grades',skipped_grades,
      'already_published_grades',already_published_grades,'paused',true);
  end if;

  for grade_row in
    select distinct coalesce(g.name,'General') as grade_label
    from public.profiles p
    join public.students st on st.id=p.linked_student_id
    left join public.grades g on g.id=st.grade_id
    where p.role='Student' and p.linked_student_id is not null
    order by 1
  loop
    if exists (
      select 1 from public.ka_daily_challenges d
      where d.challenge_date=p_challenge_date and d.grade_label=grade_row.grade_label and d.status='published'
    ) then
      already_published_grades := array_append(already_published_grades,grade_row.grade_label);
      continue;
    end if;

    target_grade := grade_row.grade_label;
    select array_agg(picked.id order by picked.priority, picked.subject_rank, picked.tie_break)
      into question_ids
    from (
      select candidates.id,
             case when candidates.subject_rank <= 2 then 0 else 1 end as priority,
             candidates.subject_rank,
             md5(candidates.id::text || p_challenge_date::text) as tie_break
      from (
        select q.id, q.subject,
               row_number() over (
                 partition by q.subject
                 order by md5(q.id::text || p_challenge_date::text)
               ) as subject_rank
        from public.ka_questions q
        where q.status='published' and q.game_type='quick_quiz' and q.grade_label=target_grade
          and not (q.subject = any(disabled_subjects))
      ) candidates
      order by case when candidates.subject_rank <= 2 then 0 else 1 end,
               candidates.subject_rank,
               md5(candidates.id::text || p_challenge_date::text)
      limit 10
    ) picked;

    -- Use a complete General set only when the exact grade does not have ten
    -- suitable Quick Quiz questions. Never mix the two grade bands.
    if coalesce(cardinality(question_ids),0) <> 10 and target_grade <> 'General' then
      target_grade := 'General';
      select array_agg(picked.id order by picked.priority, picked.subject_rank, picked.tie_break)
        into question_ids
      from (
        select candidates.id,
               case when candidates.subject_rank <= 2 then 0 else 1 end as priority,
               candidates.subject_rank,
               md5(candidates.id::text || p_challenge_date::text) as tie_break
        from (
          select q.id, q.subject,
                 row_number() over (
                   partition by q.subject
                   order by md5(q.id::text || p_challenge_date::text)
                 ) as subject_rank
          from public.ka_questions q
          where q.status='published' and q.game_type='quick_quiz' and q.grade_label='General'
            and not (q.subject = any(disabled_subjects))
        ) candidates
        order by case when candidates.subject_rank <= 2 then 0 else 1 end,
                 candidates.subject_rank,
                 md5(candidates.id::text || p_challenge_date::text)
        limit 10
      ) picked;
    end if;

    if coalesce(cardinality(question_ids),0) <> 10 then
      skipped_grades := array_append(skipped_grades,grade_row.grade_label);
      continue;
    end if;

    challenge_id := null;
    insert into public.ka_daily_challenges(
      challenge_date,grade_label,title,description,status,published_at
    ) values (
      p_challenge_date,grade_row.grade_label,'Today''s Knowledge Mix',
      'Ten Quick Quiz questions selected across available subjects for your grade band.','published',now()
    )
    on conflict (challenge_date,grade_label) do nothing
    returning id into challenge_id;

    if challenge_id is null then
      already_published_grades := array_append(already_published_grades,grade_row.grade_label);
      continue;
    end if;

    insert into public.ka_daily_challenge_items(challenge_id,question_id,sort_order)
    select challenge_id, u.question_id, u.ordinality::integer
    from unnest(question_ids) with ordinality as u(question_id,ordinality);

    published_grades := array_append(published_grades,grade_row.grade_label);
  end loop;

  return jsonb_build_object(
    'published_grades',published_grades,
    'skipped_grades',skipped_grades,
    'already_published_grades',already_published_grades,
    'published_count',cardinality(published_grades),
    'skipped_count',cardinality(skipped_grades),
    'paused',false
  );
end;
$$;

create or replace function public.ka_store_generated_question(
  p_job_id uuid,
  p_question jsonb,
  p_correct_option smallint
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  question_id uuid;
  option_count integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Not authorised';
  end if;
  option_count := jsonb_array_length(coalesce(p_question->'options','[]'::jsonb));
  if option_count < 2 or option_count > 6 or p_correct_option is null or p_correct_option < 0 or p_correct_option >= option_count then
    raise exception 'Invalid answer key or options';
  end if;
  insert into public.ka_questions (
    subject, topic, grade_label, language_code, difficulty, game_type,
    prompt, options, explanation, source_reference, status, generated_by,
    generation_job_id, published_at
  ) values (
    p_question->>'subject', p_question->>'topic', p_question->>'grade_label',
    coalesce(p_question->>'language_code','en'), p_question->>'difficulty',
    p_question->>'game_type', p_question->>'prompt', p_question->'options',
    p_question->>'explanation', p_question->>'source_reference',
    'published', 'ai', p_job_id, now()
  ) returning id into question_id;

  insert into public.ka_question_keys(question_id, correct_option)
  values (question_id, p_correct_option);
  return question_id;
end;
$$;

create or replace function public.ka_record_attempt(
  p_user_id uuid,
  p_client_attempt_id uuid,
  p_game_type text,
  p_subject text,
  p_grade_label text,
  p_challenge_id uuid,
  p_question_count integer,
  p_correct_count integer,
  p_accuracy numeric,
  p_requested_xp integer,
  p_daily_xp_cap integer,
  p_duration_seconds integer,
  p_played_on date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  attempt_id uuid;
  existing_attempt public.ka_attempts;
  prior public.ka_player_stats;
  next_streak integer;
  xp_used bigint := 0;
  awarded_xp integer := 0;
  updated_stats public.ka_player_stats;
  achievement record;
  metric_value numeric;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Not authorised';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id=p_user_id and p.role='Student' and p.linked_student_id is not null
  ) then
    raise exception 'Student account not eligible';
  end if;
  if p_client_attempt_id is null then
    raise exception 'Client attempt ID is required';
  end if;
  if p_question_count < 1 or p_correct_count < 0 or p_correct_count > p_question_count
     or p_accuracy < 0 or p_accuracy > 100 or p_requested_xp < 0 or p_daily_xp_cap < 0 then
    raise exception 'Invalid attempt totals';
  end if;

  -- Serialise attempts per player. The same client attempt ID can only award XP once,
  -- including when the browser retries after a network timeout.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into existing_attempt from public.ka_attempts
  where user_id=p_user_id and client_attempt_id=p_client_attempt_id;
  if found then
    return jsonb_build_object(
      'attempt_id',existing_attempt.id,
      'xp_awarded',existing_attempt.xp_awarded,
      'duplicate',true
    );
  end if;
  select coalesce(sum(a.xp_awarded),0)::bigint into xp_used
  from public.ka_attempts a
  where a.user_id=p_user_id
    and a.completed_at >= (p_played_on::timestamp at time zone 'Asia/Kolkata')
    and a.completed_at < ((p_played_on+1)::timestamp at time zone 'Asia/Kolkata');
  awarded_xp := greatest(0, least(p_requested_xp, p_daily_xp_cap - xp_used::integer));

  select * into prior from public.ka_player_stats where user_id=p_user_id for update;
  if not found then
    next_streak := 1;
  elsif prior.last_played_on=p_played_on then
    next_streak := prior.current_streak;
  elsif prior.last_played_on=p_played_on-1 then
    next_streak := prior.current_streak+1;
  else
    next_streak := 1;
  end if;

  insert into public.ka_attempts (
    user_id, client_attempt_id, game_type, subject, grade_label, challenge_id,
    question_count, correct_count, accuracy, xp_awarded, duration_seconds
  ) values (
    p_user_id, p_client_attempt_id, p_game_type, p_subject, p_grade_label, p_challenge_id,
    p_question_count, p_correct_count, p_accuracy, awarded_xp, p_duration_seconds
  ) returning id into attempt_id;

  insert into public.ka_player_stats (
    user_id, game_xp, games_played, questions_answered, correct_answers,
    current_streak, best_streak, last_played_on, updated_at
  ) values (
    p_user_id, awarded_xp, 1, p_question_count, p_correct_count,
    next_streak, next_streak, p_played_on, now()
  )
  on conflict (user_id) do update set
    game_xp=public.ka_player_stats.game_xp+excluded.game_xp,
    games_played=public.ka_player_stats.games_played+1,
    questions_answered=public.ka_player_stats.questions_answered+excluded.questions_answered,
    correct_answers=public.ka_player_stats.correct_answers+excluded.correct_answers,
    current_streak=case
      when public.ka_player_stats.last_played_on=excluded.last_played_on then public.ka_player_stats.current_streak
      when public.ka_player_stats.last_played_on=excluded.last_played_on-1 then public.ka_player_stats.current_streak+1
      else 1 end,
    best_streak=greatest(public.ka_player_stats.best_streak,
      case
        when public.ka_player_stats.last_played_on=excluded.last_played_on then public.ka_player_stats.current_streak
        when public.ka_player_stats.last_played_on=excluded.last_played_on-1 then public.ka_player_stats.current_streak+1
        else 1 end),
    last_played_on=greatest(public.ka_player_stats.last_played_on,excluded.last_played_on),
    updated_at=now()
  returning * into updated_stats;

  for achievement in
    select id, rule from public.ka_achievements where active=true
  loop
    metric_value := case achievement.rule->>'metric'
      when 'games_played' then updated_stats.games_played::numeric
      when 'game_xp' then updated_stats.game_xp::numeric
      when 'questions_answered' then updated_stats.questions_answered::numeric
      when 'correct_answers' then updated_stats.correct_answers::numeric
      when 'current_streak' then updated_stats.current_streak::numeric
      when 'best_streak' then updated_stats.best_streak::numeric
      else null end;
    if metric_value is not null
       and metric_value >= coalesce(nullif(achievement.rule->>'target','')::numeric, 999999999)
       and coalesce(achievement.rule->>'operator','gte')='gte' then
      insert into public.ka_player_achievements(user_id,achievement_id)
      values (p_user_id,achievement.id) on conflict do nothing;
    end if;
  end loop;

  return jsonb_build_object(
    'attempt_id',attempt_id,
    'xp_awarded',awarded_xp,
    'game_xp',updated_stats.game_xp,
    'games_played',updated_stats.games_played,
    'questions_answered',updated_stats.questions_answered,
    'correct_answers',updated_stats.correct_answers,
    'current_streak',updated_stats.current_streak,
    'best_streak',updated_stats.best_streak
  );
end;
$$;

insert into public.ka_achievements(code,title,description,icon,rule,sort_order) values
 ('first_game','First Steps','Complete your first Knowledge Arena game','🚀','{"metric":"games_played","operator":"gte","target":1}',1),
 ('ten_games','Getting Started','Complete 10 Knowledge Arena games','🎮','{"metric":"games_played","operator":"gte","target":10}',2),
 ('hundred_questions','Curious Mind','Answer 100 questions','🧠','{"metric":"questions_answered","operator":"gte","target":100}',3),
 ('streak_7','Seven-Day Streak','Play on seven consecutive days','🔥','{"metric":"best_streak","operator":"gte","target":7}',4),
 ('xp_1000','Knowledge Collector','Earn 1,000 Game XP','⭐','{"metric":"game_xp","operator":"gte","target":1000}',5)
on conflict (code) do nothing;

-- Common student leaderboard: exposes only aggregate Game XP and activity, never
-- attempts, prompts, options, answers, or question-level history.
create or replace function public.ka_get_leaderboard(p_limit integer default 50)
returns table (
  rank bigint,
  display_name text,
  game_xp bigint,
  games_played bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(public.my_role(),'') <> 'Student'
     or not exists (
       select 1 from public.profiles p
       where p.id=auth.uid() and p.role='Student' and p.linked_student_id is not null
     ) then
    raise exception 'Not authorised';
  end if;

  return query
  select row_number() over (order by s.game_xp desc, s.games_played desc, s.user_id) as rank,
         ('Player-' || upper(substr(md5(s.user_id::text),1,5)))::text as display_name,
         s.game_xp,
         s.games_played
  from public.ka_player_stats s
  join public.profiles p on p.id=s.user_id
  where p.role='Student' and p.linked_student_id is not null
  order by s.game_xp desc, s.games_played desc, s.user_id
  limit least(greatest(coalesce(p_limit,50),1),100);
end;
$$;

create or replace function public.ka_admin_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  day_start timestamptz := ((now() at time zone 'Asia/Kolkata')::date::timestamp at time zone 'Asia/Kolkata');
begin
  if coalesce(public.my_role(),'') <> 'Admin' then
    raise exception 'Not authorised';
  end if;

  select jsonb_build_object(
    'registered_players',
      (select count(*) from public.profiles p
       where p.role='Student' and p.linked_student_id is not null),
    'active_players_today',
      (select count(distinct a.user_id) from public.ka_attempts a
       where a.completed_at >= day_start),
    'games_played_today',
      (select count(*) from public.ka_attempts a
       where a.completed_at >= day_start),
    'question_bank_published',
      (select count(*) from public.ka_questions q where q.status='published'),
    'average_accuracy_30d',
      (select round(avg(a.accuracy),2) from public.ka_attempts a
       where a.completed_at >= now()-interval '30 days'),
    'generation_jobs_24h',
      (select count(*) from public.ka_generation_jobs j
       where j.created_at >= now()-interval '24 hours'),
    'generation_failures_24h',
      (select count(*) from public.ka_generation_jobs j
       where j.created_at >= now()-interval '24 hours' and j.status='failed'),
    'ai_cost_inr_24h',
      (select coalesce(sum(case when u.status='settled' then u.actual_cost_inr else u.reserved_cost_inr end),0)
       from public.ka_ai_usage u where u.created_at >= now()-interval '24 hours'),
    'ai_cost_inr_30d',
      (select coalesce(sum(case when u.status='settled' then u.actual_cost_inr else u.reserved_cost_inr end),0)
       from public.ka_ai_usage u where u.created_at >= now()-interval '30 days')
  ) into result;

  return result;
end;
$$;

revoke all on function public.ka_claim_generation_job(uuid) from public, anon, authenticated;
revoke all on function public.ka_renew_worker_lease(uuid) from public, anon, authenticated;
revoke all on function public.ka_release_worker_lease(uuid) from public, anon, authenticated;
revoke all on function public.ka_publish_daily_challenges(date) from public, anon, authenticated;
-- Restrict privileges only on the new Knowledge Arena tables; do not alter
-- grants on any existing LIB application table in the public schema.
revoke all on public.ka_questions, public.ka_question_keys, public.ka_generation_jobs,
  public.ka_attempts, public.ka_daily_challenges, public.ka_daily_challenge_items,
  public.ka_player_stats, public.ka_achievements, public.ka_player_achievements,
  public.ka_settings, public.ka_ai_usage from anon, authenticated;
grant select on public.ka_questions, public.ka_daily_challenges,
  public.ka_daily_challenge_items, public.ka_player_stats, public.ka_achievements,
  public.ka_player_achievements, public.ka_attempts to authenticated;
grant all on public.ka_questions, public.ka_question_keys, public.ka_generation_jobs,
  public.ka_attempts, public.ka_daily_challenges, public.ka_daily_challenge_items,
  public.ka_player_stats, public.ka_achievements, public.ka_player_achievements,
  public.ka_settings, public.ka_ai_usage to service_role;
revoke all on function public.ka_store_generated_question(uuid,jsonb,smallint) from public, anon, authenticated;
revoke all on function public.ka_record_attempt(uuid,uuid,text,text,text,uuid,integer,integer,numeric,integer,integer,integer,date) from public, anon, authenticated;
grant execute on function public.ka_claim_generation_job(uuid) to service_role;
grant execute on function public.ka_renew_worker_lease(uuid) to service_role;
grant execute on function public.ka_release_worker_lease(uuid) to service_role;
grant execute on function public.ka_publish_daily_challenges(date) to service_role;
grant execute on function public.ka_store_generated_question(uuid,jsonb,smallint) to service_role;
grant execute on function public.ka_record_attempt(uuid,uuid,text,text,text,uuid,integer,integer,numeric,integer,integer,integer,date) to service_role;

revoke all on function public.ka_get_leaderboard(integer) from public;
revoke all on function public.ka_admin_summary() from public;
grant execute on function public.ka_get_leaderboard(integer) to authenticated;
grant execute on function public.ka_admin_summary() to authenticated;

commit;

-- Post-deployment validation notes:
-- 1. Re-run the preflight against the exact production schema and verify no ka_* objects exist.
-- 2. Confirm role labels, linked-student coverage, grade names and subject names.
-- 3. Confirm the pseudonymous leaderboard policy and the 100-XP daily cap.
-- 4. Verify worker token lease, heartbeat/recovery and reservation-ledger behaviour.
-- 5. Test grade-specific daily challenge publication, including the <10-question skip case.
-- 6. Review all RLS/grants as Student, Admin, Teacher and unauthenticated users.
-- 7. Confirm only new ka_* objects are created or granted; do not change existing LIB grants.
-- 8. Keep generation and daily challenge switches disabled for initial schema installation.
