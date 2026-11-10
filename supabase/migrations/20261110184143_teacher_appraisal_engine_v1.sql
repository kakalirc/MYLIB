create table if not exists public.teacher_appraisal_configs (
  id uuid primary key default gen_random_uuid(), name text not null, version integer not null,
  status text not null default 'draft' check (status in ('draft','test','published','archived')),
  effective_from date, config jsonb not null default '{"categories":[],"rating_bands":[],"period_settings":{}}'::jsonb,
  notes text, created_by uuid references auth.users(id), created_at timestamptz not null default now(), published_at timestamptz,
  unique(name,version)
);
create unique index if not exists teacher_appraisal_one_published_config on public.teacher_appraisal_configs ((status)) where status='published';
create table if not exists public.teacher_appraisal_periods (
  id uuid primary key default gen_random_uuid(), period_type text not null check(period_type in ('monthly','quarterly','half_yearly','yearly','custom')),
  label text not null, start_date date not null, end_date date not null, config_id uuid not null references public.teacher_appraisal_configs(id),
  status text not null default 'open' check(status in ('open','review','finalised','closed')), created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), check(end_date>=start_date), unique(period_type,start_date,end_date)
);
create table if not exists public.teacher_appraisals (
  id uuid primary key default gen_random_uuid(), period_id uuid not null references public.teacher_appraisal_periods(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict, status text not null default 'draft' check(status in ('draft','review','finalised','reopened')),
  total_score numeric(6,2), rating text, category_scores jsonb not null default '[]'::jsonb,
  evidence_snapshot jsonb not null default '{}'::jsonb, config_snapshot jsonb not null default '{}'::jsonb,
  overall_observation text, recommendation text, finalised_by uuid references auth.users(id), finalised_at timestamptz,
  reopened_by uuid references auth.users(id), reopened_at timestamptz, reopen_reason text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(period_id,teacher_id)
);
create table if not exists public.teacher_appraisal_audit (
  id bigint generated always as identity primary key, appraisal_id uuid references public.teacher_appraisals(id) on delete restrict,
  entity_type text not null, entity_id uuid not null, action text not null, actor_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.teacher_appraisal_frequency_history (
  id bigint generated always as identity primary key, frequency_id uuid, student_id uuid, subject_id uuid,
  operation text not null check(operation in ('INSERT','UPDATE','DELETE')), old_record jsonb, new_record jsonb,
  changed_by uuid references auth.users(id), changed_at timestamptz not null default now()
);
create index if not exists teacher_appraisals_period_idx on public.teacher_appraisals(period_id);
create index if not exists teacher_appraisals_teacher_idx on public.teacher_appraisals(teacher_id);
create index if not exists teacher_appraisal_audit_entity_idx on public.teacher_appraisal_audit(entity_type,entity_id,created_at desc);
create index if not exists teacher_appraisal_frequency_history_pair_idx on public.teacher_appraisal_frequency_history(student_id,subject_id,changed_at);
create or replace function public.teacher_appraisal_audit_row() returns trigger language plpgsql security definer set search_path=public as $$
declare v_entity_id uuid; v_appraisal_id uuid; v_details jsonb;
begin
 if tg_op='DELETE' then v_entity_id:=old.id; v_details:=jsonb_build_object('before',to_jsonb(old));
 elsif tg_op='INSERT' then v_entity_id:=new.id; v_details:=jsonb_build_object('after',to_jsonb(new));
 else v_entity_id:=new.id; v_details:=jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)); end if;
 if tg_table_name='teacher_appraisals' then v_appraisal_id:=v_entity_id;
 elsif tg_table_name='teacher_appraisal_periods' and tg_op<>'DELETE' then
  select id into v_appraisal_id from public.teacher_appraisals where period_id=v_entity_id order by created_at desc limit 1;
 elsif tg_table_name='teacher_appraisal_configs' then
  select id into v_appraisal_id from public.teacher_appraisals where config_snapshot->>'config_id'=v_entity_id::text order by created_at desc limit 1;
 end if;
 insert into public.teacher_appraisal_audit(appraisal_id,entity_type,entity_id,action,actor_id,details)
 values(v_appraisal_id,tg_table_name,v_entity_id,tg_op,auth.uid(),v_details);
 return case when tg_op='DELETE' then old else new end;
end $$;
create or replace function public.teacher_appraisal_capture_frequency() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  insert into public.teacher_appraisal_frequency_history(frequency_id,student_id,subject_id,operation,new_record,changed_by)
  values(new.id,new.student_id,new.subject_id,'INSERT',to_jsonb(new),auth.uid()); return new;
 elsif tg_op='UPDATE' then
  insert into public.teacher_appraisal_frequency_history(frequency_id,student_id,subject_id,operation,old_record,new_record,changed_by)
  values(new.id,new.student_id,new.subject_id,'UPDATE',to_jsonb(old),to_jsonb(new),auth.uid()); return new;
 else
  insert into public.teacher_appraisal_frequency_history(frequency_id,student_id,subject_id,operation,old_record,changed_by)
  values(old.id,old.student_id,old.subject_id,'DELETE',to_jsonb(old),auth.uid()); return old;
 end if;
end $$;
drop trigger if exists teacher_appraisal_frequency_history_trg on public.student_subject_frequency;
create trigger teacher_appraisal_frequency_history_trg after insert or update or delete on public.student_subject_frequency for each row execute function public.teacher_appraisal_capture_frequency();
drop trigger if exists teacher_appraisal_appraisals_audit_trg on public.teacher_appraisals;
create trigger teacher_appraisal_appraisals_audit_trg after insert or update or delete on public.teacher_appraisals for each row execute function public.teacher_appraisal_audit_row();
drop trigger if exists teacher_appraisal_periods_audit_trg on public.teacher_appraisal_periods;
create trigger teacher_appraisal_periods_audit_trg after insert or update or delete on public.teacher_appraisal_periods for each row execute function public.teacher_appraisal_audit_row();
drop trigger if exists teacher_appraisal_configs_audit_trg on public.teacher_appraisal_configs;
create trigger teacher_appraisal_configs_audit_trg after insert or update or delete on public.teacher_appraisal_configs for each row execute function public.teacher_appraisal_audit_row();
alter table public.teacher_appraisal_configs enable row level security;
alter table public.teacher_appraisal_periods enable row level security;
alter table public.teacher_appraisals enable row level security;
alter table public.teacher_appraisal_audit enable row level security;
alter table public.teacher_appraisal_frequency_history enable row level security;
drop policy if exists teacher_appraisal_configs_admin on public.teacher_appraisal_configs;
create policy teacher_appraisal_configs_admin on public.teacher_appraisal_configs for all to authenticated using(public.my_role()='Admin') with check(public.my_role()='Admin');
drop policy if exists teacher_appraisal_periods_admin on public.teacher_appraisal_periods;
create policy teacher_appraisal_periods_admin on public.teacher_appraisal_periods for all to authenticated using(public.my_role()='Admin') with check(public.my_role()='Admin');
drop policy if exists teacher_appraisals_admin on public.teacher_appraisals;
create policy teacher_appraisals_admin on public.teacher_appraisals for all to authenticated using(public.my_role()='Admin') with check(public.my_role()='Admin');
drop policy if exists teacher_appraisal_audit_admin on public.teacher_appraisal_audit;
create policy teacher_appraisal_audit_admin on public.teacher_appraisal_audit for select to authenticated using(public.my_role()='Admin');
drop policy if exists teacher_appraisal_frequency_history_admin on public.teacher_appraisal_frequency_history;
create policy teacher_appraisal_frequency_history_admin on public.teacher_appraisal_frequency_history for select to authenticated using(public.my_role()='Admin');
insert into public.teacher_appraisal_configs(name,version,status,effective_from,config,notes)
values('LIB Teacher Appraisal',1,'published',current_date,
'{"categories":[
{"id":"teaching_delivery","name":"Teaching & Class Delivery","weight":30,"metrics":[
{"id":"frequency_adherence","name":"Student-level class frequency adherence","weight":10,"method":"percentage","source":"student_subject_frequency+scheduled_classes+sessions","target":100,"description":"Expected classes are derived from each active student-subject weekly frequency; actual classes are derived from attendance sessions."},
{"id":"overall_delivery","name":"Overall class delivery rate","weight":10,"method":"percentage","source":"scheduled_classes+sessions","target":100,"description":"Conducted outcomes against assigned due classes; future pending classes are excluded."},
{"id":"schedule_management","name":"Missed, cancelled and rescheduled class management","weight":5,"method":"admin_review","source":"scheduled_classes+teacher_leave","description":"Admin assesses documented teacher-controlled handling."},
{"id":"class_record_reconciliation","name":"Class record reconciliation","weight":5,"method":"admin_review","source":"scheduled_classes+sessions","description":"Admin reviews exceptions and mismatches between scheduled classes and attendance records."}]},
{"id":"student_engagement","name":"Student Engagement & Attendance","weight":10,"metrics":[
{"id":"student_attendance","name":"Student attendance and participation","weight":5,"method":"percentage","source":"sessions","target":100,"description":"Attendance trends; student absence is not automatically attributed to the teacher."},
{"id":"absence_followup","name":"Follow-up on student absence","weight":5,"method":"admin_review","source":"sessions+homework","description":"Admin assessment requires recorded evidence; absence alone is not proof of poor follow-up."}]},
{"id":"academic_planning","name":"Academic Planning & Learning Support","weight":15,"metrics":[
{"id":"study_plan_quality","name":"Study plan progress and maintenance","weight":7,"method":"percentage","source":"study_plans","target":100,"description":"Progress on existing plans; missing plan coverage is separately assessed."},
{"id":"homework_quality","name":"Homework assignment and review","weight":5,"method":"percentage","source":"homework","target":100,"description":"Review and feedback completion for homework actually assigned."},
{"id":"learning_support","name":"Learning support and progress evidence","weight":3,"method":"admin_review","source":"teacher_notes+study_plans+homework","description":"Admin assessment supported by actual records."}]},
{"id":"professional_discipline","name":"Professional Discipline","weight":10,"metrics":[
{"id":"schedule_discipline","name":"Schedule and availability discipline","weight":4,"method":"admin_review","source":"teacher_availability+scheduled_classes","description":"Evidence-based assessment; punctuality is not scored without reliable start timestamps."},
{"id":"leave_management","name":"Leave and schedule-change management","weight":3,"method":"admin_review","source":"teacher_leave+scheduled_classes","description":"Admin assesses leave notice and arrangements."},
{"id":"professional_records","name":"Professional communication and records","weight":3,"method":"admin_review","source":"teacher_notes+app_events","description":"Admin assessment requires recorded evidence."}]},
{"id":"app_usage","name":"App Usage & Digital Adoption","weight":5,"metrics":[
{"id":"teacher_app_adoption","name":"Relevant Teacher App feature adoption","weight":3,"method":"percentage","source":"app_events","target":100,"description":"Distinct relevant feature usage; raw click volume is not a performance score."},
{"id":"ai_adoption","name":"Appropriate AI feature adoption","weight":2,"method":"percentage","source":"ai_usage_log","target":100,"description":"Only applicable where AI access is enabled and use is relevant."}]},
{"id":"research_improvement","name":"Research & Teaching Improvement","weight":5,"metrics":[
{"id":"research_notes","name":"Research and improvement notes","weight":2,"method":"count_target","source":"teacher_research_notes","target":1,"description":"Documented research activity; target is configurable."},
{"id":"teaching_resources","name":"Teaching resources created or shared","weight":3,"method":"count_target","source":"teacher_resources","target":1,"description":"Documented resources; target is configurable."}]},
{"id":"data_compliance","name":"Data & Process Compliance","weight":25,"metrics":[
{"id":"attendance_timeliness","name":"Timely attendance entry","weight":10,"method":"timeliness_bands","source":"sessions.created_at+scheduled_classes.time","deadline_hours":24,"grace_hours":0,"bands":[{"max_hours":24,"score_percent":100},{"max_hours":48,"score_percent":75},{"max_hours":72,"score_percent":40},{"max_hours":999999,"score_percent":0}],"missing_score_percent":0,"description":"Attendance submission timestamp measured against scheduled class time. Deadline and scoring bands are configurable."},
{"id":"attendance_completeness","name":"Attendance completeness and accuracy","weight":5,"method":"percentage","source":"scheduled_classes+sessions","target":100,"description":"Due assigned classes with matching attendance records; missing attendance is visible."},
{"id":"study_plan_compliance","name":"Study plan record maintenance","weight":4,"method":"percentage","source":"study_plans","target":100,"description":"Study Plan coverage for active teacher student-subject assignments; missing entries are visible."},
{"id":"homework_compliance","name":"Homework and progress record maintenance","weight":3,"method":"admin_review","source":"homework","description":"Admin assesses expected entries and follow-up; no assumed weekly homework quota."},
{"id":"research_resource_compliance","name":"Research notes and teaching resources maintenance","weight":3,"method":"admin_review","source":"teacher_research_notes+teacher_resources","description":"Admin assesses applicable records and responsibilities."}]}],
"rating_bands":[{"label":"Outstanding","min":90,"max":100},{"label":"Very Good","min":80,"max":89.99},{"label":"Good","min":70,"max":79.99},{"label":"Needs Improvement","min":60,"max":69.99},{"label":"Unsatisfactory","min":0,"max":59.99}],
"period_settings":{"allowed":["monthly","quarterly","half_yearly","yearly"],"admin_editable_dates":true}}'::jsonb,
'Initial configurable rules; Admin-assessed metrics require evidence and manual score before finalisation.')
on conflict(name,version) do nothing;