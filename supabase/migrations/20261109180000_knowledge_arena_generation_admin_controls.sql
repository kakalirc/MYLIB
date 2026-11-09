-- Admin generation job management: soft-delete/archive without destroying
-- generated questions or AI usage audit history.
begin;

alter table public.ka_generation_jobs
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

create index if not exists ka_generation_jobs_active_created_idx
  on public.ka_generation_jobs (created_at desc)
  where archived_at is null;

comment on column public.ka_generation_jobs.archived_at is
  'When an Admin removed this job from the active generation list. The job, generated questions and AI usage audit history are retained.';
comment on column public.ka_generation_jobs.archived_by is
  'Admin user who archived the generation job.';

commit;
