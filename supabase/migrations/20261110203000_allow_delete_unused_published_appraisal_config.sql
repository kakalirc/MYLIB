-- Allow deletion of Published scoring configurations only when no appraisal period uses them.
-- The audit insert remains atomic with the DELETE; a rejected DELETE leaves no audit row.
CREATE OR REPLACE FUNCTION public.audit_teacher_appraisal_config_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status NOT IN ('draft','archived','published') THEN
    RAISE EXCEPTION 'This scoring configuration status cannot be deleted.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.teacher_appraisal_periods p
    WHERE p.config_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'This scoring configuration is linked to an appraisal period and cannot be deleted.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'Admin'
      AND COALESCE(p.archived, false) = false
  ) THEN
    RAISE EXCEPTION 'Only active Admins can delete scoring configurations.';
  END IF;

  INSERT INTO public.teacher_appraisal_audit
    (entity_type, entity_id, action, actor_id, details)
  VALUES
    ('configuration', OLD.id, 'configuration_deleted', auth.uid(),
     jsonb_build_object('version', OLD.version, 'status', OLD.status, 'name', OLD.name));

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_teacher_appraisal_config_delete() FROM PUBLIC, anon, authenticated;
