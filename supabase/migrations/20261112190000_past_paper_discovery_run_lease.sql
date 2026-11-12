-- A lease distinguishes an active discovery invocation from a run abandoned by an Edge Function timeout.
-- Successful batches release the lease; crashed invocations become resumable after five minutes.
alter table public.qb_paper_discovery_runs
  add column if not exists heartbeat_at timestamptz;

comment on column public.qb_paper_discovery_runs.heartbeat_at is
  'Active discovery invocation lease. NULL means idle/resumable; stale values expire after five minutes.';
