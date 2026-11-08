-- French is a supported language for Knowledge Arena language preferences and question generation.
alter table public.ka_student_preferences
  drop constraint if exists ka_student_preferences_preferred_language_code_check;

alter table public.ka_student_preferences
  add constraint ka_student_preferences_preferred_language_code_check
  check (preferred_language_code = any (array['en','hi','kn','sa','fr']::text[]));

-- French is a taught LIB subject and must not be hidden from Knowledge Arena.
update public.ka_settings
set disabled_subjects = array_remove(coalesce(disabled_subjects, '{}'::text[]), 'French'),
    updated_at = now()
where id = 1;
