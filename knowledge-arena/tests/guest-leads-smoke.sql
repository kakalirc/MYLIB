-- Guest lead and activity migration smoke test. Disposable CI database only.
insert into public.ka_guest_leads (id,mobile_e164,last_guest_name,last_grade_label)
values ('40000000-0000-0000-0000-000000000001','+919876543210','Parent Name','Class 1');

insert into public.ka_guest_sessions
  (id,lead_id,session_token_hash,guest_name,grade_label,expires_at)
values
  ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',repeat('a',64),'Child One','Class 1',now()+interval '30 days');

insert into public.ka_guest_activity
  (lead_id,session_id,client_attempt_id,game_type,subject,question_count,correct_count,accuracy)
values
  ('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','quick_quiz','Mathematics',5,4,80);

do $$
declare lead_games bigint; lead_questions bigint; session_games bigint; consent_rows integer; active_promos integer;
begin
  select games_completed,questions_answered into lead_games,lead_questions
    from public.ka_guest_leads where id='40000000-0000-0000-0000-000000000001';
  select games_completed into session_games from public.ka_guest_sessions
    where id='50000000-0000-0000-0000-000000000001';
  if lead_games<>1 or lead_questions<>5 or session_games<>1 then
    raise exception 'Guest activity rollup failed: lead %, questions %, session %',lead_games,lead_questions,session_games;
  end if;
  select count(*) into consent_rows from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('ka_guest_leads','ka_guest_sessions','ka_guest_activity','ka_guest_consents','ka_guest_lead_notes','ka_guest_promotions','ka_guest_promotion_events') and c.relrowsecurity;
  if consent_rows<>7 then raise exception 'RLS is not enabled on all seven guest tables'; end if;
  if has_table_privilege('anon','public.ka_guest_leads','select') then raise exception 'anon must not read guest leads'; end if;
  select count(*) into active_promos from public.ka_guest_promotions where active;
  if active_promos<3 then raise exception 'Expected three default guest promotions'; end if;
  begin
    insert into public.ka_guest_activity
      (lead_id,session_id,client_attempt_id,game_type,subject,question_count,correct_count,accuracy)
    values
      ('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','quick_quiz','Mathematics',5,4,80);
    raise exception 'Duplicate guest attempt was accepted';
  exception when unique_violation then
    null;
  end;
  select games_completed into lead_games from public.ka_guest_leads where id='40000000-0000-0000-0000-000000000001';
  if lead_games<>1 then raise exception 'Duplicate attempt changed the activity counters'; end if;
end $$;
