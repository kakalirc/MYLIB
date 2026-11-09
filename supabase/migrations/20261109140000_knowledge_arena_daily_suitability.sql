-- Ensure daily challenges obey the same grade, subject and game suitability rules as practice.
begin;
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
          and exists (select 1 from public.ka_grade_subject_rules gs
            where gs.grade_label=grade_row.grade_label and lower(gs.subject)=lower(q.subject) and gs.enabled=true)
          and exists (select 1 from public.ka_game_grade_rules gg
            where gg.grade_label=grade_row.grade_label and gg.game_type=q.game_type and gg.enabled=true)
          and exists (select 1 from public.ka_game_subject_rules gsr
            where gsr.game_type=q.game_type and lower(gsr.subject)=lower(q.subject) and gsr.enabled=true)
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


revoke all on function public.ka_publish_daily_challenges(date) from public, anon, authenticated;
grant execute on function public.ka_publish_daily_challenges(date) to service_role;
commit;
