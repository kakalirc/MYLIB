do $$
declare v public.teacher_appraisal_configs%rowtype; c jsonb;
begin
 select * into v from public.teacher_appraisal_configs where name='LIB Teacher Appraisal' and status='published' order by version desc limit 1;
 if not found then raise exception 'Published Teacher Appraisal configuration not found'; end if;
 update public.teacher_appraisal_configs set status='archived' where id=v.id;
 c:=jsonb_set(v.config,'{categories,6,subcategories,0,metrics,1,name}','"Attendance record completeness"'::jsonb,true);
 c:=jsonb_set(c,'{categories,6,subcategories,0,metrics,1,description}','"Due assigned classes with a matching attendance session record; missing entries reduce the score. Accuracy exceptions are reviewed separately under class-record reconciliation."'::jsonb,true);
 c:=jsonb_set(c,'{categories,6,subcategories,0,metrics,0,description}','"Attendance submission timestamp measured from scheduled start because actual class-end timestamps are not stored; deadline, grace and late-entry bands are configurable."'::jsonb,true);
 insert into public.teacher_appraisal_configs(name,version,status,effective_from,config,notes,created_by,published_at)
 values(v.name,v.version+1,'published',current_date,c,'Clarify attendance completeness versus accuracy and document scheduled-start timestamp limitation.',auth.uid(),now());
end $$;