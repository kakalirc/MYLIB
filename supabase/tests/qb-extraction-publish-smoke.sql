-- Exercise Admin-approved publication, passage linking and idempotent replay.
-- Apply the proposed fail-closed guards here as well as in the CI migration sequence,
-- so this smoke test remains meaningful on base-branch workflow definitions.
\\ir ../migrations/20261115230000_qb_extraction_completeness_accounting_gates.sql
do $$
declare v_admin uuid:=gen_random_uuid();v_grade uuid;v_board uuid;v_paper uuid;v_run uuid;v_passage uuid;v_passage_duplicate uuid;v_result jsonb;v_count integer;
begin
 insert into auth.users(id) values(v_admin);
 insert into public.profiles(id,role,archived) values(v_admin,'Admin',false);
 insert into public.grades(name) values('Publish Test Grade') returning id into v_grade;
 insert into public.boards(name) values('Publish Test Board') returning id into v_board;
 insert into public.qb_source_papers(grade_id,board_id,subject_name,year,exam_type,medium,source_type,stored_pdf_url)
 values(v_grade,v_board,'English',2026,'main','English','board','qb-papers/publish-test.pdf') returning id into v_paper;
 insert into public.qb_paper_extraction_runs(source_paper_id,requested_by,status,ai_request_state,current_stage)
 values(v_paper,v_admin,'completed','responded','review') returning id into v_run;
 insert into public.qb_paper_extraction_pages(run_id,page_number,page_state,page_kind,page_metadata,completed_at)
 values(v_run,1,'completed','mixed','{"extraction_audit":{"version":1,"status":"review","question_count":1,"passage_count":1,"flags":["Test warning requiring visual comparison."]}}'::jsonb,now());
 insert into public.qb_paper_extraction_requests(run_id,chunk_key,provider,model_name,idempotency_key,request_state,request_payload)
 values(v_run,'pages:1-1:v5','anthropic','test-model',v_run::text||':pages:1-1:v5','responded','{}'::jsonb,now(),'{}'::jsonb);
 insert into public.qb_paper_extraction_staging(run_id,item_key,item_kind,original_number,payload,content_fingerprint,review_state)
 values(v_run,'passage:P1','passage','P1','{"passage_text":"A short test passage.","passage_type":"reading","passage_key":"passage-alias-P1"}'::jsonb,repeat('a',64),'approved'),
 (v_run,'passage:P1-copy','passage','P1-copy','{"passage_text":"A   short test passage.","passage_type":"reading"}'::jsonb,repeat('c',64),'approved');
 insert into public.qb_paper_extraction_staging(run_id,item_key,item_kind,page_number,original_number,parent_item_key,payload,content_fingerprint,review_state)
 values(v_run,'question:1','question',1,'1','passage_1','{"question_text":"What is the passage about?","question_type":"short_answer","marks":2,"answer_text":"A test.","difficulty":"easy"}'::jsonb,repeat('b',64),'approved');
 perform set_config('request.jwt.claim.role','service_role',true);
 v_result:=public.qb_publish_extraction_run(v_run,v_admin);
 if v_result->>'code'<>'page_audit_review_required' then raise exception 'Flagged page must require explicit Admin visual review: %',v_result; end if;
 update public.qb_paper_extraction_pages
 set page_metadata=page_metadata||jsonb_build_object('admin_audit_review',jsonb_build_object(
   'decision','visually_verified','reviewed_by',v_admin::text,'reviewed_at',now()::text,
   'note','Compared every visible question against the original PDF page.'))
 where run_id=v_run and page_number=1;
 v_result:=public.qb_publish_extraction_run(v_run,v_admin);
 if v_result->>'code'<>'usage_accounting_incomplete' then raise exception 'Missing provider usage must block publication: %',v_result; end if;
 update public.qb_paper_extraction_requests set input_tokens=100,output_tokens=20,
   input_cost_usd=0.0001,output_cost_usd=0.0001,total_cost_usd=0.0002
 where run_id=v_run and chunk_key='pages:1-1:v5';
 update public.qb_paper_extraction_runs set input_tokens=100,output_tokens=20,actual_cost_usd=0.0002
 where id=v_run;
 v_result:=public.qb_publish_extraction_run(v_run,v_admin);
 if coalesce((v_result->>'ok')::boolean,false) is not true then raise exception 'First publication failed after page and usage reconciliation: %',v_result; end if;
 select count(*) into v_count from public.qb_questions where source_paper_id=v_paper;
 if v_count<>1 then raise exception 'Expected one published question, got %',v_count; end if;
 select passage_id into v_passage from public.qb_questions where source_paper_id=v_paper;
 if v_passage is null or not exists(select 1 from public.qb_passages where id=v_passage and approved=true) then
   raise exception 'Approved passage was not linked to the question';
 end if;
 select published_passage_id into v_passage_duplicate from public.qb_paper_extraction_staging where run_id=v_run and item_key='passage:P1-copy';
 if v_passage_duplicate is distinct from v_passage then raise exception 'Duplicate passage did not reuse the canonical passage id'; end if;
 v_result:=public.qb_publish_extraction_run(v_run,v_admin);
 if coalesce((v_result->>'ok')::boolean,false) is not true then raise exception 'Replay failed: %',v_result; end if;
 select count(*) into v_count from public.qb_questions where source_paper_id=v_paper;
 if v_count<>1 then raise exception 'Publication replay duplicated questions'; end if;
end $$;
