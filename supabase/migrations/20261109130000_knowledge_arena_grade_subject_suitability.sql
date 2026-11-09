-- Configurable academic suitability for Knowledge Arena.
-- Seed conservative defaults from the existing LIB grade and subject catalogues.
begin;

alter table public.ka_questions drop constraint if exists ka_questions_game_type_check;
alter table public.ka_questions add constraint ka_questions_game_type_check check (
  game_type = any (array[
    'word_master','number_quest','science_explorer','quick_quiz','brain_teaser','memory_challenge',
    'world_explorer','history_quest','society_culture_challenge','civics_constitution_challenge',
    'economics_explorer','money_matters','word_builder','math_sprint'
  ]::text[])
);

alter table public.ka_generation_jobs drop constraint if exists ka_generation_jobs_game_type_check;
alter table public.ka_generation_jobs add constraint ka_generation_jobs_game_type_check check (
  game_type = any (array[
    'word_master','number_quest','science_explorer','quick_quiz','brain_teaser','memory_challenge',
    'world_explorer','history_quest','society_culture_challenge','civics_constitution_challenge',
    'economics_explorer','money_matters','word_builder','math_sprint'
  ]::text[])
);

create table if not exists public.ka_grade_subject_rules (
  grade_label text not null,
  subject text not null,
  enabled boolean not null default false,
  source text not null default 'default',
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  primary key (grade_label, subject)
);

create table if not exists public.ka_game_subject_rules (
  game_type text not null,
  subject text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  primary key (game_type, subject)
);

create table if not exists public.ka_game_grade_rules (
  game_type text not null,
  grade_label text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  primary key (game_type, grade_label)
);

-- Subject eligibility defaults. Admin can override every row from the control centre.
insert into public.ka_grade_subject_rules(grade_label,subject,enabled,source)
select g.name, s.name,
  case
    when lower(s.name) in ('english','hindi','kannada','sanskrit') then
      g.name <> 'Tina Student'
    when lower(s.name) = 'french' then
      g.name ilike '%french%' or lower(g.name)='language'
    when lower(s.name) in ('math','mathematics','math + science','science') then
      g.name not in ('Language','French upto class 8','French above class 8','Tina Student')
    when lower(s.name) in ('social science','history') then
      g.name in ('5','6','7','8','9','10','11','12','PU','IGCSE above class 8')
    when lower(s.name) in ('economics','political science','sociology') then
      g.name in ('11','12','PU')
    else false
  end,
  'default'
from public.grades g
cross join (select distinct trim(name) as name from public.subjects where trim(name) <> '' and lower(trim(name)) not in ('all','math + science')) s
where coalesce(g.archived,false)=false
on conflict (grade_label,subject) do nothing;

-- Subject-to-game defaults. The subject label is taken from LIB's actual catalogue.
insert into public.ka_game_subject_rules(game_type,subject,enabled)
select game.id, s.name, true
from (values
  ('word_master','English'),('word_master','Hindi'),('word_master','Kannada'),('word_master','Sanskrit'),('word_master','French'),
  ('word_builder','English'),('word_builder','Hindi'),('word_builder','Kannada'),('word_builder','Sanskrit'),('word_builder','French'),
  ('number_quest','Math'),('math_sprint','Math'),
  ('science_explorer','Science'),
  ('world_explorer','Social science'),
  ('history_quest','History'),('history_quest','Social science'),
  ('society_culture_challenge','Sociology'),('society_culture_challenge','Social science'),
  ('civics_constitution_challenge','Political Science'),('civics_constitution_challenge','Social science'),
  ('economics_explorer','Economics'),
  ('money_matters','Economics'),('money_matters','Math')
) as game(id,subject)
join (select distinct trim(name) as name from public.subjects) s on lower(s.name)=lower(game.subject)
on conflict (game_type,subject) do nothing;

insert into public.ka_game_subject_rules(game_type,subject,enabled)
select game.id, s.name, true
from (values ('quick_quiz'),('brain_teaser'),('memory_challenge')) as game(id)
cross join (select distinct trim(name) as name from public.subjects where lower(trim(name)) <> 'all') s
on conflict (game_type,subject) do nothing;

insert into public.ka_game_grade_rules(game_type,grade_label,enabled)
select distinct gs.game_type, gsr.grade_label, true
from public.ka_game_subject_rules gs
join public.ka_grade_subject_rules gsr on lower(gsr.subject)=lower(gs.subject) and gsr.enabled=true
where gs.enabled=true
on conflict (game_type,grade_label) do nothing;

alter table public.ka_grade_subject_rules enable row level security;
alter table public.ka_game_subject_rules enable row level security;
alter table public.ka_game_grade_rules enable row level security;
revoke all on public.ka_grade_subject_rules, public.ka_game_subject_rules, public.ka_game_grade_rules from anon, authenticated;
grant all on public.ka_grade_subject_rules, public.ka_game_subject_rules, public.ka_game_grade_rules to service_role;

commit;
