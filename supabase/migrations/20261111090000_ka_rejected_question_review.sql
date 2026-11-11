alter table public.ka_generation_jobs add column if not exists drafted_count integer not null default 0;

create table if not exists public.ka_rejected_questions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.ka_generation_jobs(id) on delete set null,
  subject text not null,
  grade_label text not null,
  game_type text not null,
  difficulty text not null default 'medium',
  language_code text not null default 'en',
  topic text,
  candidate jsonb not null,
  rejection_stage text not null,
  rejection_reason text not null,
  review_status text not null default 'pending' check (review_status in ('pending','converted_to_draft','dismissed')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ka_rejected_questions_pending_idx
  on public.ka_rejected_questions(created_at desc) where review_status='pending';
alter table public.ka_rejected_questions enable row level security;
revoke all on public.ka_rejected_questions from anon, authenticated;
grant all on public.ka_rejected_questions to service_role;

create or replace function public.ka_store_generated_question(p_job_id uuid, p_question jsonb, p_correct_option smallint)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare question_id uuid; option_count integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Not authorised'; end if;
  option_count := jsonb_array_length(coalesce(p_question->'options','[]'::jsonb));
  if option_count <> 4 or p_correct_option is null or p_correct_option < 0 or p_correct_option >= option_count then
    raise exception 'A draft question must have exactly four options and a valid answer key';
  end if;
  insert into public.ka_questions (
    subject,topic,grade_label,language_code,difficulty,game_type,prompt,options,explanation,
    source_reference,status,generated_by,generation_job_id,published_at
  ) values (
    p_question->>'subject',p_question->>'topic',p_question->>'grade_label',
    coalesce(p_question->>'language_code','en'),p_question->>'difficulty',p_question->>'game_type',
    p_question->>'prompt',p_question->'options',p_question->>'explanation',
    p_question->>'source_reference','pending','ai',p_job_id,null
  ) returning id into question_id;
  insert into public.ka_question_keys(question_id,correct_option) values(question_id,p_correct_option);
  return question_id;
end; $$;
revoke all on function public.ka_store_generated_question(uuid,jsonb,smallint) from public,anon,authenticated;
grant execute on function public.ka_store_generated_question(uuid,jsonb,smallint) to service_role;