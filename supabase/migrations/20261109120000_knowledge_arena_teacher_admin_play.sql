-- Allow authorised LIB Teachers and Admins to play Knowledge Arena in grade-selected player mode.
-- Grade selection is validated by the authenticated Edge Function and is not written to LIB profiles.
begin;

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
    where p.id=p_user_id and p.role in ('Student','Teacher','Admin')
      and (p.role <> 'Student' or p.linked_student_id is not null)
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


revoke all on function public.ka_record_attempt(uuid,uuid,text,text,text,uuid,integer,integer,numeric,integer,integer,integer,date) from public, anon, authenticated;
grant execute on function public.ka_record_attempt(uuid,uuid,text,text,text,uuid,integer,integer,numeric,integer,integer,integer,date) to service_role;

commit;
