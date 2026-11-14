-- Exercise Admin-approved publication, passage linking and idempotent replay.
do $$
declare v_admin uuid:=gen_random_uuid();v_grade uuid;v_board uuid;v_paper uuid;v_run uuid;v_passage uuid;v_result jsonb;v_count integer;
begin
 insert into auth.users(id) values(v_admin);
 insert into public.profiles(id,role,archived) values(v_admin,'Admin',false);
 insert into public.grades(name) values('Publish Test Grade') returning id into v_grade;
 insert into public.boards(name) values('Publish Test Board') returning id into v_board;
 insert into public.qb_source_papers(grade_id,board_id,subject_name,year,exam_type,medium,source_type,stored_pdf_url)
 values(v_grade,v_board,'English',2026,'main','English','board','qb-papers/publish-test.pdf') returning id into v_paper;
 insert into public.qb_paper_extraction_runs(source_paper_id,requested_by,status,ai_request_state,current_stage)
 values(v_paper,v_admin,'completed','responded','review') returning id into v_run;
 insert into public.qb_paper_extraction_staging(run_id,item_key,item_kind,original_number,payload,content_fingerprint,review_state)
 values(v_run,'passage:P1','passage','P1','{"passage_text":"A short test passage.","passage_type":"reading"}'::jsonb,repeat('a',64),'approved');
 insert into public.qb_paper_extraction_staging(run_id,item_key,item_kind,page_number,original_number,parent_item_key,payload,content_fingerprint,review_state)
 values(v_run,'question:1','question',1,'1','P1','{"question_text":"What is the passage about?","question_type":"short_answer","marks":2,"answer_text":"A test.","difficulty":"easy"}'::jsonb,repeat('b',64),'approved');
 perform set_config('request.jwt.claim.role','service_role',true);
 v_result:=public.qb_publish_extraction_run(v_run,v_admin);
 if coalesce((v_result->>'ok')::boolean,false) is not true then raise exception 'First publication failed: %',v_result; end if;
 select count(*) into v_count from public.qb_questions where source_paper_id=v_paper;
 if v_count<>1 then raise exception 'Expected one published question, got %',v_count; end if;
 select passage_id into v_passage from public.qb_questions where source_paper_id=v_paper;
 if v_passage is null or not exists(select 1 from public.qb_passages where id=v_passage and approved=true) then
   raise exception 'Approved passage was not linked to the question';
 end if;
 v_result:=public.qb_publish_extraction_run(v_run,v_admin);
 if coalesce((v_result->>'ok')::boolean,false) is not true then raise exception 'Replay failed: %',v_result; end if;
 select count(*) into v_count from public.qb_questions where source_paper_id=v_paper;
 if v_count<>1 then raise exception 'Publication replay duplicated questions'; end if;
end $$;
