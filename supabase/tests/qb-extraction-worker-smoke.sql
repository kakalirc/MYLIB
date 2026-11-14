-- Integration smoke tests for the extraction ledger, leases and request-state safety.
do $$
declare v_user uuid:=gen_random_uuid(); v_grade uuid; v_board uuid; v_paper uuid; v_run uuid; v_claim jsonb; v_req uuid; v_renewed boolean; v_expiry timestamptz;
begin
 insert into auth.users(id) values(v_user);
 insert into public.profiles(id,role,archived) values(v_user,'Admin',false);
 insert into public.grades(name) values('Test Grade') returning id into v_grade;
 insert into public.boards(name) values('Test Board') returning id into v_board;
 insert into public.qb_source_papers(grade_id,board_id,subject_name,year,exam_type,medium,source_type,stored_pdf_url)
 values(v_grade,v_board,'Mathematics',2026,'main','English','board','qb-papers/test.pdf') returning id into v_paper;
 insert into public.qb_paper_extraction_runs(source_paper_id,requested_by,status,ai_request_state)
 values(v_paper,v_user,'queued','not_sent') returning id into v_run;
 perform set_config('request.jwt.claim.role','service_role',true);
 v_claim:=public.qb_claim_extraction_worker(v_run,'worker-one',600);
 if coalesce((v_claim->>'ok')::boolean,false) is not true then raise exception 'First worker could not claim run: %',v_claim; end if;
 v_claim:=public.qb_claim_extraction_worker(v_run,'worker-two',600);
 if v_claim->>'code'<>'worker_busy' then raise exception 'Concurrent worker was not rejected: %',v_claim; end if;
 select lease_expires_at into v_expiry from public.qb_paper_extraction_runs where id=v_run;
 v_renewed:=public.qb_renew_extraction_worker(v_run,'worker-one',900);
 if v_renewed is not true then raise exception 'Current worker could not renew its active lease'; end if;
 if not exists(select 1 from public.qb_paper_extraction_runs where id=v_run and lease_expires_at>v_expiry and heartbeat_at is not null) then
   raise exception 'Lease expiry/heartbeat was not extended';
 end if;
 update public.qb_paper_extraction_runs set lease_expires_at=now()-interval '1 second' where id=v_run;
 v_renewed:=public.qb_renew_extraction_worker(v_run,'worker-one',900);
 if v_renewed is not false then raise exception 'Expired worker must not resurrect its lease'; end if;
 v_claim:=public.qb_claim_extraction_worker(v_run,'worker-two',900);
 if coalesce((v_claim->>'ok')::boolean,false) is not true then raise exception 'Second worker could not claim an expired lease: %',v_claim; end if;
 v_renewed:=public.qb_renew_extraction_worker(v_run,'worker-one',900);
 if v_renewed is not false then raise exception 'Former worker renewed a lease after ownership changed'; end if;
 insert into public.qb_paper_extraction_requests(run_id,chunk_key,provider,model_name,idempotency_key,request_state,request_payload)
 values(v_run,'pages:1-1:v1','anthropic','test-model',v_run::text||':pages:1-1:v1','prepared','{}'::jsonb)
 returning id into v_req;
 update public.qb_paper_extraction_requests set request_state='sent',sent_at=now() where id=v_req;
 begin
   update public.qb_paper_extraction_requests set request_state='failed_before_send' where id=v_req;
   raise exception 'Expected sent request reset to be rejected';
 exception when raise_exception then
   if sqlerrm='Expected sent request reset to be rejected' then raise; end if;
 end;
 perform public.qb_release_extraction_worker(v_run,'worker-two');
end $$;
