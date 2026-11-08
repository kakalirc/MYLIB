-- French is a supported language for Knowledge Arena preferences and question generation.
alter table public.ka_student_preferences
  drop constraint if exists ka_student_preferences_preferred_language_code_check;

alter table public.ka_student_preferences
  add constraint ka_student_preferences_preferred_language_code_check
  check (preferred_language_code = any (array['en','hi','kn','sa','fr']::text[]));

-- LIB teaches these languages and Mathematics; expose them in Knowledge Arena.
update public.ka_settings
set disabled_subjects = array_remove(
      array_remove(
        array_remove(
          array_remove(
            array_remove(
              array_remove(coalesce(disabled_subjects, '{}'::text[]), 'French'),
            'English'),
          'Hindi'),
        'Kannada'),
      'Sanskrit'),
    'Math'),
    disabled_game_types = '{}'::text[],
    updated_at = now()
where id = 1;
