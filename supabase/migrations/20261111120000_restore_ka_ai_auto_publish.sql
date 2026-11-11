-- Restore the pre-PR #201 behaviour for AI-generated questions that pass
-- structural and independent quality validation: publish them immediately.
-- Rejected candidates remain in the Admin review queue; manual Admin-created
-- questions and rejected-candidate approvals continue to use Draft status.

create or replace function public.ka_store_generated_question(
  p_job_id uuid,
  p_question jsonb,
  p_correct_option smallint
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  question_id uuid;
  option_count integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Not authorised';
  end if;

  option_count := jsonb_array_length(coalesce(p_question->'options','[]'::jsonb));
  if option_count <> 4 or p_correct_option is null
     or p_correct_option < 0 or p_correct_option >= option_count then
    raise exception 'A published question must have exactly four options and a valid answer key';
  end if;

  insert into public.ka_questions (
    subject,topic,grade_label,language_code,difficulty,game_type,prompt,options,explanation,
    source_reference,status,generated_by,generation_job_id,published_at
  ) values (
    p_question->>'subject',p_question->>'topic',p_question->>'grade_label',
    coalesce(p_question->>'language_code','en'),p_question->>'difficulty',p_question->>'game_type',
    p_question->>'prompt',p_question->'options',p_question->>'explanation',
    p_question->>'source_reference','published','ai',p_job_id,now()
  ) returning id into question_id;

  insert into public.ka_question_keys(question_id,correct_option)
  values(question_id,p_correct_option);

  return question_id;
end;
$$;

revoke all on function public.ka_store_generated_question(uuid,jsonb,smallint)
  from public,anon,authenticated;
grant execute on function public.ka_store_generated_question(uuid,jsonb,smallint)
  to service_role;
