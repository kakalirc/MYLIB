-- Allow active Admins to append configuration lifecycle events to the appraisal audit log.
-- Existing SELECT policy remains unchanged; no UPDATE or DELETE permission is granted.
DROP POLICY IF EXISTS teacher_appraisal_audit_admin_insert ON public.teacher_appraisal_audit;
CREATE POLICY teacher_appraisal_audit_admin_insert
ON public.teacher_appraisal_audit
FOR INSERT
TO authenticated
WITH CHECK (
  my_role() = 'Admin'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'Admin'
      AND COALESCE(p.archived, false) = false
  )
);
