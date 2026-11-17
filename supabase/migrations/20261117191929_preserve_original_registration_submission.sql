-- Preserve the exact parent-visible registration form separately from normalized student fields.
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS original_submission jsonb;

CREATE OR REPLACE FUNCTION public.submit_registration(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_student text := left(btrim(coalesce(p->>'student_name', '')), 80);
  v_parent  text := left(btrim(coalesce(p->>'parent_name', '')), 80);
  v_mobile  text := right(regexp_replace(coalesce(p->>'parent_mobile', ''), '\D', '', 'g'), 10);
  v_mobile2 text := right(regexp_replace(coalesce(p->>'second_mobile', ''), '\D', '', 'g'), 10);
  v_smobile text := right(regexp_replace(coalesce(p->>'student_mobile', ''), '\D', '', 'g'), 10);
  v_email   text := nullif(left(btrim(coalesce(p->>'email', '')), 120), '');
  v_grade   text := nullif(p->>'grade_id', '');
  v_board   text := nullif(p->>'board_id', '');
  v_mode    text := nullif(p->>'mode_preference', '');
  v_type    text := nullif(p->>'class_type_preference', '');
  v_subjects text[];
  v_original jsonb;
begin
  -- Hidden spam box: people never see it, bots fill it in. Pretend it worked.
  if coalesce(p->>'website', '') <> '' then
    return jsonb_build_object('ok', true);
  end if;
  if coalesce((p->>'elapsed_ms')::numeric, 0) < 5000 then
    return jsonb_build_object('ok', false, 'error', 'That was very quick. Please check the form and press Send again.');
  end if;
  if coalesce((p->>'consent')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'Please tick the box to agree to the Terms and Privacy Policy.');
  end if;
  if length(v_student) < 2 or v_student ~ '\d' then
    return jsonb_build_object('ok', false, 'error', 'Please type the student''s name (no numbers).');
  end if;
  if length(v_parent) < 2 or v_parent ~ '\d' then
    return jsonb_build_object('ok', false, 'error', 'Please type the parent''s name (no numbers).');
  end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'Please type a 10-digit mobile number.');
  end if;
  if v_mobile2 = '' or v_mobile2 = v_mobile then v_mobile2 := null;
  elsif v_mobile2 !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'The second mobile number should have 10 digits.');
  end if;
  if v_smobile = '' then v_smobile := null;
  elsif v_smobile !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'The student''s mobile number should have 10 digits.');
  end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'Please check the email address.');
  end if;
  -- Keep the existing normalized fields for operational use. The exact parent-visible grade
  -- label is retained separately in original_submission and is never inferred from this ID.
  if v_grade is not null and v_grade <> 'NA' and not exists (select 1 from grades where id::text = v_grade) then v_grade := null; end if;
  if v_board is not null and not exists (select 1 from boards where id::text = v_board) then v_board := null; end if;
  if v_mode is not null and v_mode not in ('Online', 'Offline', 'Both') then v_mode := null; end if;
  if v_type is not null and v_type not in ('Group', 'Individual', 'Both') then v_type := null; end if;

  select coalesce(array_agg(s), '{}') into v_subjects
    from (
      select distinct left(btrim(x), 60) as s
      from jsonb_array_elements_text(
        coalesce(p->'subjects', '[]'::jsonb) ||
        case when nullif(btrim(coalesce(p->>'subject_other', '')), '') is not null
          then jsonb_build_array(p->>'subject_other') else '[]'::jsonb end
      ) x
      limit 10
    ) t
   where s <> '';

  if (select count(*) from registrations where parent_mobile = v_mobile and created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('ok', false, 'error', 'We already have forms from this mobile today. Please call us if something needs changing.');
  end if;
  if (select count(*) from registrations where created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'We cannot take more forms today. Please call us and we will register you.');
  end if;
  if exists (select 1 from registrations where status = 'New' and parent_mobile = v_mobile and lower(student_name) = lower(v_student)) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  v_original := p->'original_form';
  if coalesce(jsonb_typeof(v_original), '') <> 'object' then
    v_original := jsonb_build_object(
      'student_name', p->'student_name',
      'grade', p->'grade_id',
      'board', p->'board_id',
      'student_mobile', p->'student_mobile',
      'school', p->'school',
      'subjects', p->'subjects',
      'subject_other', p->'subject_other',
      'mode_preference', p->'mode_preference',
      'class_type_preference', p->'class_type_preference',
      'parent_name', p->'parent_name',
      'parent_mobile', p->'parent_mobile',
      'second_mobile', p->'second_mobile',
      'email', p->'email',
      'address', p->'address',
      'heard_from', p->'heard_from',
      'note', p->'note',
      'consent', p->'consent'
    );
  end if;

  insert into registrations (
    student_name, grade_id, board_id, school, student_mobile, subjects, mode_preference, class_type_preference,
    parent_name, parent_mobile, second_mobile, email, address, heard_from, note, original_submission
  )
  values (
    v_student, v_grade, v_board, nullif(left(btrim(coalesce(p->>'school', '')), 120), ''), v_smobile, v_subjects, v_mode, v_type,
    v_parent, v_mobile, v_mobile2, v_email,
    nullif(left(btrim(coalesce(p->>'address', '')), 300), ''),
    nullif(left(btrim(coalesce(p->>'heard_from', '')), 60), ''),
    nullif(left(btrim(coalesce(p->>'note', '')), 500), ''),
    v_original
  );

  return jsonb_build_object('ok', true);
end;
$function$;
