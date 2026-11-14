-- Explicit, audited Admin reconciliation for extraction attempts whose provider outcome cannot be established.
alter table public.qb_paper_extraction_runs
  add column if not exists admin_reconciled_at timestamptz,
  add column if not exists admin_reconciled_by uuid references auth.users(id),
  add column if not exists admin_reconciliation_note text;

comment on column public.qb_paper_extraction_runs.admin_reconciled_at is
  'Timestamp when an Admin explicitly accepted the unresolved provider-outcome risk and released the paper for a new extraction run.';
comment on column public.qb_paper_extraction_runs.admin_reconciliation_note is
  'Required audit note explaining the explicit Admin reconciliation of an unresolved provider attempt.';
