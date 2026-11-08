-- Disposable CI-only Knowledge Arena schema smoke test.
set request.jwt.claim.role = 'service_role';

insert into public.grades(id,name) values
  ('10000000-0000-0000-0000-000000000001','Class 1'),
  ('10000000-0000-0000-0000-000000000002','Class 2');
insert into public.subjects(name) values ('Mathematics'),('Science');
insert into auth.users(id) values
  ('20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002');
insert into public.students(id,grade_id) values
  ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
insert into public.profiles(id,role,linked_student_id) values
  ('20000000-0000-0000-0000-000000000001','Student','30000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002','Student','30000000-0000-0000-0000-000000000002');

update public.ka_settings set daily_challenge_enabled=true, games_enabled=true where id=1;

insert into public.ka_questions(
  subject,topic,grade_label,language_code,difficulty,game_type,prompt,options,explanation,
  status,published_at
)
select
  case when n % 2 = 0 then 'Mathematics' else 'Science' end,
  'CI topic ' || n,'Class 1','en','easy','quick_quiz',
  'CI smoke question ' || n,
  jsonb_build_array('Option A','Option B','Option C','Option D'),
  'This is a CI-only explanation for question ' || n,
  'published',now()
from generate_series(1,10) n;

insert into public.ka_questions(
  subject,topic,grade_label,language_code,difficulty,game_type,prompt,options,explanation,
  status,published_at
)
select 'Mathematics','CI topic ' || n,'Class 2','en','easy','quick_quiz',
  'Class 2 CI smoke question ' || n,
  jsonb_build_array('Option A','Option B','Option C','Option D'),
  'This is a CI-only explanation for question ' || n,
  'published',now()
from generate_series(1,9) n;

insert into public.ka_question_keys(question_id,correct_option)
select id,0 from public.ka_questions;

do $$
declare
  publication jsonb;
  challenge_count integer;
  item_count integer;
  lease_token uuid := gen_random_uuid();
  claimed record;
  duplicate_rejected boolean := false;
  repeat_publication jsonb;
  renewed boolean;
  released boolean;
  queued_job uuid;
begin
  begin
    insert into public.ka_questions(
      subject,topic,grade_label,language_code,difficulty,game_type,prompt,options,explanation,status,published_at
    )
    select subject,'duplicate topic',grade_label,language_code,difficulty,game_type,prompt,options,explanation,'pending',null
    from public.ka_questions where grade_label='Class 1' limit 1;
    raise exception 'Database accepted a duplicate question prompt.';
  exception when unique_violation then
    duplicate_rejected := true;
  end;
  if not duplicate_rejected then raise exception 'Duplicate prompt protection did not run.'; end if;

  publication := public.ka_publish_daily_challenges((now() at time zone 'Asia/Kolkata')::date);
  if coalesce((publication->>'published_count')::integer,0) <> 1
     or coalesce((publication->>'skipped_count')::integer,0) <> 1 then
    raise exception 'Expected one published grade and one grade skipped for insufficient questions, got %', publication;
  end if;
  repeat_publication := public.ka_publish_daily_challenges((now() at time zone 'Asia/Kolkata')::date);
  if coalesce((repeat_publication->>'published_count')::integer,0) <> 0 then
    raise exception 'Daily challenge publication must be idempotent for the same date.';
  end if;

  select count(*) into challenge_count
  from public.ka_daily_challenges
  where challenge_date=(now() at time zone 'Asia/Kolkata')::date
    and grade_label='Class 1' and status='published';
  select count(*) into item_count
  from public.ka_daily_challenge_items i
  join public.ka_daily_challenges d on d.id=i.challenge_id
  where d.challenge_date=(now() at time zone 'Asia/Kolkata')::date
    and d.grade_label='Class 1';
  if challenge_count <> 1 or item_count <> 10 then
    raise exception 'Daily challenge must contain exactly ten questions.';
  end if;

  insert into public.ka_generation_jobs(
    status,subject,topic,grade_label,language_code,game_type,difficulty,requested_count
  ) values (
    'queued','Mathematics','CI topic','Class 1','en','quick_quiz','easy',1
  ) returning id into queued_job;

  select * into claimed from public.ka_claim_generation_job(lease_token);
  if claimed.id is distinct from queued_job or claimed.status <> 'running' then
    raise exception 'Worker failed to claim the queued generation job.';
  end if;

  select public.ka_renew_worker_lease(lease_token) into renewed;
  if renewed is not true then raise exception 'Worker lease renewal failed.'; end if;

  select public.ka_release_worker_lease(gen_random_uuid()) into released;
  if released is not false then raise exception 'A non-owner released the worker lease.'; end if;

  select public.ka_release_worker_lease(lease_token) into released;
  if released is not true then raise exception 'Worker lease owner could not release its lease.'; end if;

  if has_table_privilege('authenticated','public.ka_question_keys','SELECT') then
    raise exception 'Authenticated role must not read private answer keys.';
  end if;
  if has_table_privilege('authenticated','public.ka_ai_usage','SELECT') then
    raise exception 'Authenticated role must not read AI usage ledger.';
  end if;
  if has_table_privilege('authenticated','public.ka_generation_jobs','SELECT') then
    raise exception 'Authenticated role must not read generation jobs.';
  end if;
  if not has_table_privilege('authenticated','public.ka_questions','SELECT') then
    raise exception 'Authenticated role needs limited question read access.';
  end if;
  if has_table_privilege('authenticated','public.ka_questions','INSERT') then
    raise exception 'Authenticated role must not insert questions directly.';
  end if;
end
$$;
