-- Safe Admin-only deletion of unfinalised teacher appraisal drafts.
-- Preserve audit records after deleting the source appraisal/period.

ALTER TABLE public.teacher_appraisal_audit
  DROP CONSTRAINT teacher_appraisal_audit_appraisal_id_fkey;
ALTER TABLE public.teacher_appraisal_audit
  ADD CONSTRAINT teacher_appraisal_audit_appraisal_id_fkey
  FOREIGN KEY (appraisal_id) REFERENCES public.teacher_appraisals(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.teacher_appraisal_audit_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_entity_id uuid; v_appraisal_id uuid; v_details jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id; v_details := jsonb_build_object('before', to_jsonb(OLD));
  ELSIF TG_OP = 'INSERT' THEN
    v_entity_id := NEW.id; v_details := jsonb_build_object('after', to_jsonb(NEW));
  ELSE
    v_entity_id := NEW.id; v_details := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  END IF;
  IF TG_TABLE_NAME = 'teacher_appraisals' THEN
    IF TG_OP <> 'DELETE' THEN v_appraisal_id := v_entity_id; END IF;
  ELSIF TG_TABLE_NAME = 'teacher_appraisal_periods' AND TG_OP <> 'DELETE' THEN
    SELECT id INTO v_appraisal_id FROM public.teacher_appraisals WHERE period_id = v_entity_id ORDER BY created_at DESC LIMIT 1;
  ELSIF TG_TABLE_NAME = 'teacher_appraisal_configs' THEN
    SELECT id INTO v_appraisal_id FROM public.teacher_appraisals WHERE config_snapshot->>'config_id' = v_entity_id::text ORDER BY created_at DESC LIMIT 1;
  END IF;
  INSERT INTO public.teacher_appraisal_audit(appraisal_id,entity_type,entity_id,action,actor_id,details)
  VALUES(v_appraisal_id,TG_TABLE_NAME,v_entity_id,TG_OP,auth.uid(),v_details);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_teacher_appraisal_draft(p_appraisal_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_status text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='Admin' AND COALESCE(p.archived,false)=false) THEN
    RAISE EXCEPTION 'Only active Admins can delete draft appraisals.';
  END IF;
  SELECT a.status INTO v_status FROM public.teacher_appraisals a WHERE a.id=p_appraisal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appraisal not found.'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Only Draft appraisals can be deleted. Finalised, reopened, and review records are protected.'; END IF;
  DELETE FROM public.teacher_appraisals WHERE id=p_appraisal_id AND status='draft';
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_teacher_appraisal_period_drafts(p_period_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_deleted integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='Admin' AND COALESCE(p.archived,false)=false) THEN
    RAISE EXCEPTION 'Only active Admins can delete appraisal periods.';
  END IF;
  PERFORM 1 FROM public.teacher_appraisal_periods WHERE id=p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appraisal period not found.'; END IF;
  IF EXISTS (SELECT 1 FROM public.teacher_appraisals WHERE period_id=p_period_id AND status <> 'draft' FOR UPDATE) THEN
    RAISE EXCEPTION 'This period contains a non-Draft appraisal. No records were deleted.';
  END IF;
  DELETE FROM public.teacher_appraisals WHERE period_id=p_period_id AND status='draft';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  DELETE FROM public.teacher_appraisal_periods WHERE id=p_period_id;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_teacher_appraisal_draft(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_teacher_appraisal_period_drafts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_teacher_appraisal_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_teacher_appraisal_period_drafts(uuid) TO authenticated;
