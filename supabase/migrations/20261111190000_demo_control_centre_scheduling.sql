-- Link a Knowledge Arena guest enquiry to its scheduled Demo Register row.
-- Demo Register remains the source of truth for teacher delivery and demo bonus/payroll.
alter table public.demo_control_followups
  add column if not exists demo_log_id uuid references public.demo_logs(id) on delete set null;
create index if not exists demo_control_followups_demo_log_idx
  on public.demo_control_followups(demo_log_id) where demo_log_id is not null;
