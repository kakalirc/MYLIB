-- Atomic Admin-approved publication from extraction staging into the existing QB tables.
create or replace function public.qb_publish_extraction_run(p_run_id uuid,p_admin_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_run record; v_paper record; v_item record; v_payload jsonb; v_key text;
 v_passages jsonb:='{}'::jsonb; v_passage_id uuid; v_question_id uuid;
 v_type text; v_options jsonb; v_marks numeric; v_questions integer:=0; v_passage_count integer:=0;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Publication is restricted to the trusted server'; end if;
 if not exists(select 1 from public.profiles where id=p_admin_id and role='Admin' and coalesce(archived,false)=false) then
   return jsonb_build_object('ok',false,'code','admin_required');
 end if;
 select * into v_run from public.qb_paper_extraction_runs where id=p_run_id for update;
 if not found then return jsonb_build_object('ok',false,'code','run_not_found'); end if;
 if v_run.status<>'completed' or v_run.current_stage not in ('review','finished') then
   return jsonb_build_object('ok',false,'code','run_not_ready','status',v_run.status,'stage',v_run.current_stage);
 end if;
 select * into v_paper from public.qb_source_papers where id=v_run.source_paper_id for update;
 if not found or v_paper.status<>'published' then return jsonb_build_object('ok',false,'code','paper_not_published'); end if;
 if v_paper.board_id is null then
   return jsonb_build_object('ok',false,'code','board_mapping_required','message','This school paper has no board mapping. Assign a board before publishing questions.');
 end if;
 if exists(select 1 from public.qb_paper_extraction_staging where run_id=p_run_id and review_state in ('pending','edited')) then
   return jsonb_build_object('ok',false,'code','review_incomplete','message','Every staged item must be approved or rejected before publication.');
 end if;

 -- Reuse any passage IDs already committed by a prior successful publication.
 for v_item in select * from public.qb_paper_extraction_staging
   where run_id=p_run_id and item_kind='passage' and review_state='approved'
   order by page_number,created_at
 loop
   if v_item.published_passage_id is not null then
     v_passage_id:=v_item.published_passage_id;
   else
     v_payload:=v_item.payload;
     if coalesce(trim(v_payload->>'passage_text'),'')='' then raise exception 'Approved passage % has no passage_text',v_item.item_key; end if;
     insert into public.qb_passages(subject_name,passage_text,passage_type,word_count,difficulty,source,approved)
     values(v_paper.subject_name,v_payload->>'passage_text',nullif(v_payload->>'passage_type',''),
       array_length(regexp_split_to_array(trim(v_payload->>'passage_text'),'\s+'),1),
       coalesce(nullif(v_payload->>'difficulty',''),'medium'),
       'Past paper '||v_paper.year,true)
     returning id into v_passage_id;
     update public.qb_paper_extraction_staging set published_passage_id=v_passage_id,updated_at=now() where id=v_item.id;
     v_passage_count:=v_passage_count+1;
   end if;
   v_key:=coalesce(nullif(v_item.original_number,''),v_item.item_key);
   v_passages:=jsonb_set(v_passages,array[v_key],to_jsonb(v_passage_id::text),true);
 end loop;

 for v_item in select * from public.qb_paper_extraction_staging
   where run_id=p_run_id and item_kind='question' and review_state='approved'
   order by page_number,created_at
 loop
   if v_item.published_question_id is not null then continue; end if;
   v_payload:=v_item.payload;
   if coalesce(trim(v_payload->>'question_text'),'')='' then raise exception 'Approved question % has no question_text',v_item.item_key; end if;
   v_type:=lower(coalesce(v_payload->>'question_type','other'));
   v_type:=case v_type
     when 'mcq' then 'mcq' when 'multiple choice' then 'mcq'
     when 'short_answer' then 'short_answer' when 'short answer' then 'short_answer'
     when 'long_answer' then 'long_answer' when 'long answer' then 'long_answer'
     when 'fill_blank' then 'fill_blank' when 'fill in the blank' then 'fill_blank'
     when 'true_false' then 'true_false' when 'true/false' then 'true_false'
     when 'matching' then 'matching' else 'other' end;
   v_options:=case when jsonb_typeof(v_payload->'options')='array' then v_payload->'options' else null end;
   v_marks:=coalesce(nullif(v_payload->>'marks','')::numeric,1);
   v_passage_id:=null;
   if coalesce(v_item.parent_item_key,'')<>'' then
     v_key:=v_item.parent_item_key;
     if v_passages ? v_key then v_passage_id:=(v_passages->>v_key)::uuid;
     else
       select published_passage_id into v_passage_id from public.qb_paper_extraction_staging
        where run_id=p_run_id and item_kind='passage' and original_number=v_key and review_state='approved' limit 1;
     end if;
     if v_passage_id is null then raise exception 'Question % references a passage that was not approved',v_item.item_key; end if;
   end if;
   insert into public.qb_questions(
     subject_name,grade_id,board_id,chapter_id,passage_id,question_text,question_type,marks,difficulty,
     answer_text,explanation_text,source_paper_id,source_year,source_exam_type,language,approved,approved_by,approved_at,
     added_by,section,section_label,options,correct_option,topic
   ) values(
     v_paper.subject_name,v_paper.grade_id,v_paper.board_id,null,v_passage_id,v_payload->>'question_text',v_type,v_marks,
     coalesce(nullif(v_payload->>'difficulty',''),'medium'),nullif(v_payload->>'answer_text',''),nullif(v_payload->>'explanation_text',''),
     v_paper.id,v_paper.year,v_paper.exam_type,coalesce(nullif(v_paper.medium,''),'English'),true,p_admin_id,now(),
     p_admin_id,nullif(v_payload->>'section',''),nullif(v_payload->>'section_label',''),v_options,
     nullif(v_payload->>'correct_option',''),nullif(v_payload->>'topic','')
   ) returning id into v_question_id;
   update public.qb_paper_extraction_staging set published_question_id=v_question_id,updated_at=now() where id=v_item.id;
   v_questions:=v_questions+1;
 end loop;

 update public.qb_paper_extraction_runs set current_stage='finished',
   linked_question_count_at_end=(select count(*) from public.qb_questions where source_paper_id=v_paper.id),
   updated_at=now() where id=p_run_id;
 return jsonb_build_object('ok',true,'run_id',p_run_id,'questions_published',v_questions,
   'passages_published',v_passage_count,'stage','finished');
end $$;
revoke all on function public.qb_publish_extraction_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.qb_publish_extraction_run(uuid,uuid) to service_role;
