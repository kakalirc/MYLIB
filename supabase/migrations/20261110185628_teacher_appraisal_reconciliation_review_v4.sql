do $$
declare v public.teacher_appraisal_configs%rowtype; c jsonb;
begin
 select * into v from public.teacher_appraisal_configs where name='LIB Teacher Appraisal' and status='published' order by version desc limit 1;
 if not found then raise exception 'Published Teacher Appraisal configuration not found'; end if;
 update public.teacher_appraisal_configs set status='archived' where id=v.id;
 c:=jsonb_set(v.config,'{categories,0,subcategories,0,metrics,3,method}','"admin_review"'::jsonb,true);
 c:=jsonb_set(c,'{categories,0,subcategories,0,metrics,3,description}','"Admin reviews class-level reconciliation exceptions and mismatches; valid attendance evidence is visible at record level."'::jsonb,true);
 insert into public.teacher_appraisal_configs(name,version,status,effective_from,config,notes,created_by,published_at)
 values(v.name,v.version+1,'published',current_date,c,'Class record reconciliation is Admin-reviewed rather than double-counting the overall delivery percentage.',auth.uid(),now());
end $$;