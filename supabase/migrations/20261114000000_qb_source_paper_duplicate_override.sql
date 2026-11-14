-- Persist an administrator's decision that a matching paper is not a duplicate.
ALTER TABLE public.qb_source_papers
  ADD COLUMN IF NOT EXISTS duplicate_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_override_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_override_at timestamptz;

COMMENT ON COLUMN public.qb_source_papers.duplicate_override IS
  'When true, this paper is excluded from metadata-based possible-duplicate warnings by administrator decision.';
COMMENT ON COLUMN public.qb_source_papers.duplicate_override_by IS
  'Authenticated administrator who marked this paper as not a duplicate.';
COMMENT ON COLUMN public.qb_source_papers.duplicate_override_at IS
  'Timestamp of the administrator duplicate-override decision.';
