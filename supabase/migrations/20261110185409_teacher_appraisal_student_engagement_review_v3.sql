do $$
declare v public.teacher_appraisal_configs%rowtype; c jsonb;
begin
 select * into v from public.teacher_appraisal_configs where name='LIB Teacher Appraisal' and status='published' order by version desc limit 1;
 if not found then raise exception 'Published Teacher Appraisal configuration not found'; end if;
 update public.teacher_appraisal_configs set status='archived' where id=v.id;
 c:=jsonb_set(v.config,'{categories,1,subcategories,0,metrics,0,method}','"admin_review"'::jsonb,true);
 c:=jsonb_set(c,'{categories,1,subcategories,0,metrics,0,description}','"Admin reviews student attendance trends and engagement evidence; student absence alone is not treated as teacher underperformance."'::jsonb,true);
 insert into public.teacher_appraisal_configs(name,version,status,effective_from,config,notes,created_by,published_at)
 values(v.name,v.version+1,'published',current_date,c,'Student attendance is Admin-assessed to avoid penalising teachers for student absence without engagement evidence.',auth.uid(),now());
end $$;