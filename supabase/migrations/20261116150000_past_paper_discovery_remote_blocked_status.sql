-- Allow the discovery verifier to persist transport-level blocks distinctly.
-- The Edge Function already classifies connection resets/timeouts as remote_blocked.
alter table public.qb_paper_discovery_candidates
  drop constraint if exists qb_paper_discovery_candidates_verification_status_check;

alter table public.qb_paper_discovery_candidates
  add constraint qb_paper_discovery_candidates_verification_status_check
  check (verification_status in (
    'unverified',
    'verified',
    'inaccessible',
    'unsafe_url',
    'invalid_pdf',
    'duplicate',
    'remote_blocked'
  ));
