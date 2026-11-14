-- Verify explicit Admin reconciliation releases only the reconciled paper for a new claim.
do $$
declare
 v_admin uuid:=gen_random_uuid(); v_grade uuid; v_board uuid; v_paper uuid; v_run uuid; v_claim jsonb;
begin
 insert into auth.users(id) values(v_admin);
 insert into public.profiles(id,role,archived) values(v_admin,'Admin',false);
 insert into public.grades(name) values('Reconciliation Test Grade') returning id into v_grade;
 insert into public.boards(name) values('Reconciliation Test Board') returning id into v_board;
 insert into public.qb_source_papers(grade_id,board_id,subject_name,year,exam_type,medium,source_type,stored_pdf_url)
 values(v_grade,v_board,'Sanskrit',2026,'main','English','board','qb-papers/reconciliation-test.pdf') returning id into v_paper;
 insert into public.qb_paper_extraction_runs(source_paper_id,requested_by,status,ai_request_state,admin_reconciled_at,admin_reconciled_by,admin_reconciliation_note)
 values(v_paper,v_admin,'uncertain','uncertain',now(),v_admin,'Provider outcome unknown; explicitly reconciled by Admin.') returning id into v_run;
 perform set_config('request.jwt.claim.role','service_role',true);
 v_claim:=public.qb_begin_paper_extraction(v_paper,v_admin,null);
 if coalesce((v_claim->>'ok')::boolean,false) is not true then
   raise exception 'Explicitly reconciled run should allow a new claim: %',v_claim;
 end if;
 if not exists(select 1 from public.qb_paper_extraction_runs where id=v_run and status='uncertain' and ai_request_state='uncertain' and admin_reconciled_at is not null) then
   raise exception 'Original uncertain run must remain intact';
 end if;
end $$;
