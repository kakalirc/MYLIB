-- Integration smoke tests for the extraction ledger, leases and request-state safety.
do $$
declare v_user uuid:=gen_random_uuid(); v_grade uuid; v_board uuid; v_paper uuid; v_run uuid; v_claim jsonb; v_req uuid; v_renewed boolean; v_expiry timestamptz; v_failed boolean;
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
 v_failed:=public.qb_fail_extraction_worker_if_owner(v_run,'worker-one','stale worker failure');
 if v_failed is not false then raise exception 'Stale worker must not fail a run owned by another worker'; end if;
 if not exists(select 1 from public.qb_paper_extraction_runs where id=v_run and status='processing' and lease_owner='worker-two') then
   raise exception 'Stale worker changed the active worker run state';
 end if;
 insert into public.qb_paper_extraction_requests(run_id,chunk_key,provider,model_name,idempotency_key,request_state,request_payload)
 values(v_run,'pages:1-1:v1','anthropic','test-model',v_run::text||':pages:1-1:v1','prepared','{}'::jsonb)
 returning id into v_req;
 update public.qb_paper_extraction_requests set request_state='sent',sent_at=now() where id=v_req;
 v_claim:=public.qb_set_extraction_worker_state(v_run,'worker-two','processing','sent',null);
 if coalesce((v_claim->>'ok')::boolean,false) is not true then raise exception 'Initial sent transition failed: %',v_claim; end if;
 update public.qb_paper_extraction_requests set request_state='responded',response_payload='{"items":[]}'::jsonb,responded_at=now() where id=v_req;
 -- Response payload becomes immutable after persistence, but usage columns remain repairable.
 update public.qb_paper_extraction_requests
    set input_tokens=1000000,output_tokens=200000,
        input_cost_usd=1.00000000,output_cost_usd=1.00000000,total_cost_usd=2.00000000
  where id=v_req and request_state='responded';
 if not exists(select 1 from public.qb_paper_extraction_requests
                where id=v_req and input_tokens=1000000 and output_tokens=200000
                  and total_cost_usd=2.00000000 and response_payload='{"items":[]}'::jsonb) then
   raise exception 'Usage metadata update must not rewrite the immutable provider response';
 end if;
 begin
   update public.qb_paper_extraction_requests set response_payload='{"items":[{"changed":true}]}'::jsonb where id=v_req;
   raise exception 'Expected immutable provider response update to be rejected';
 exception when raise_exception then
   if sqlerrm='Expected immutable provider response update to be rejected' then raise; end if;
 end;
 if not exists(select 1 from public.qb_paper_extraction_requests where id=v_req and response_payload='{"items":[]}'::jsonb) then
   raise exception 'Immutable provider response payload was changed';
 end if;
 v_claim:=public.qb_set_extraction_worker_state(v_run,'worker-two','processing','responded',null);
 if coalesce((v_claim->>'ok')::boolean,false) is not true then raise exception 'Durable response transition failed: %',v_claim; end if;
 insert into public.qb_paper_extraction_requests(run_id,chunk_key,provider,model_name,idempotency_key,request_state,request_payload,sent_at)
 values(v_run,'pages:2-3:v4','anthropic','test-model',v_run::text||':pages:2-3:v4','sent','{}'::jsonb,now());
 v_claim:=public.qb_set_extraction_worker_state(v_run,'worker-two','processing','sent',null);
 if coalesce((v_claim->>'ok')::boolean,false) is not true then raise exception 'Sequential next-batch transition was rejected: %',v_claim; end if;
 update public.qb_paper_extraction_requests set request_state='uncertain',error_message='test ambiguous outcome' where run_id=v_run and chunk_key='pages:2-3:v4';
 v_claim:=public.qb_set_extraction_worker_state(v_run,'worker-two','processing','uncertain','test ambiguous outcome');
 if coalesce((v_claim->>'ok')::boolean,false) is not true then raise exception 'Non-terminal ambiguous transition failed: %',v_claim; end if;
 -- The ambiguous chunk remains in the ledger, but later independent batches may proceed.
 v_claim:=public.qb_set_extraction_worker_state(v_run,'worker-two','processing','responded','skip ambiguous chunk and continue');
 if coalesce((v_claim->>'ok')::boolean,false) is not true then raise exception 'Could not resume after ambiguous chunk: %',v_claim; end if;
 insert into public.qb_paper_extraction_requests(run_id,chunk_key,provider,model_name,idempotency_key,request_state,request_payload,sent_at)
 values(v_run,'pages:4-5:v4','anthropic','test-model',v_run::text||':pages:4-5:v4','sent','{}'::jsonb,now());
 v_claim:=public.qb_set_extraction_worker_state(v_run,'worker-two','processing','sent',null);
 insert into public.qb_paper_extraction_requests(run_id,chunk_key,provider,model_name,idempotency_key,request_state,request_payload,sent_at)
 values(v_run,'pages:2-3:v4:retry1','anthropic','test-model',v_run::text||':pages:2-3:v4:retry1','sent','{"attempt":2}'::jsonb,now());
 v_claim:=public.qb_set_extraction_worker_state(v_run,'worker-two','processing','sent',null);
 if coalesce((v_claim->>'ok')::boolean,false) is not true then raise exception 'First audited retry was blocked by original uncertain request: %',v_claim; end if;
 update public.qb_paper_extraction_requests set request_state='uncertain',error_message='retry 1 ambiguous' where run_id=v_run and chunk_key='pages:2-3:v4:retry1';
 v_claim:=public.qb_set_extraction_worker_state(v_run,'worker-two','processing','uncertain','retry 1 ambiguous');
 if coalesce((v_claim->>'ok')::boolean,false) is not true then raise exception 'First retry ambiguity was not recorded: %',v_claim; end if;
 v_claim:=public.qb_set_extraction_worker_state(v_run,'worker-two','processing','responded','prepare second audited retry');
 if coalesce((v_claim->>'ok')::boolean,false) is not true then raise exception 'Could not prepare second audited retry: %',v_claim; end if;
 insert into public.qb_paper_extraction_requests(run_id,chunk_key,provider,model_name,idempotency_key,request_state,request_payload,sent_at)
 values(v_run,'pages:2-3:v4:retry2','anthropic','test-model',v_run::text||':pages:2-3:v4:retry2','sent','{"attempt":3}'::jsonb,now());
 v_claim:=public.qb_set_extraction_worker_state(v_run,'worker-two','processing','sent',null);
 if coalesce((v_claim->>'ok')::boolean,false) is not true then raise exception 'Second audited retry was blocked: %',v_claim; end if;
 update public.qb_paper_extraction_requests set request_state='uncertain',error_message='retry 2 ambiguous' where run_id=v_run and chunk_key='pages:2-3:v4:retry2';
 v_claim:=public.qb_set_extraction_worker_state(v_run,'worker-two','processing','uncertain','retry 2 ambiguous');
 if coalesce((v_claim->>'ok')::boolean,false) is not true then raise exception 'Second retry ambiguity was not recorded: %',v_claim; end if;
 if coalesce((v_claim->>'ok')::boolean,false) is not true then raise exception 'Later independent batch was blocked by an older uncertain chunk: %',v_claim; end if;
 update public.qb_paper_extraction_requests set request_state='responded',response_payload='{"items":[]}'::jsonb,responded_at=now()
  where run_id=v_run and chunk_key='pages:4-5:v4' and request_state='sent';
 v_claim:=public.qb_set_extraction_worker_state(v_run,'worker-two','processing','responded','finish independent batch before retry checks');
 if coalesce((v_claim->>'ok')::boolean,false) is not true then raise exception 'Could not finish independent batch before retry checks: %',v_claim; end if;
 begin
   update public.qb_paper_extraction_requests set request_state='failed_before_send' where id=v_req;
   raise exception 'Expected sent request reset to be rejected';
 exception when raise_exception then
   if sqlerrm='Expected sent request reset to be rejected' then raise; end if;
 end;
 perform public.qb_release_extraction_worker(v_run,'worker-two');
end $$;
