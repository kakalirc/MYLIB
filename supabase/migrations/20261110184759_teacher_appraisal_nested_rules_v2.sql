do $$
declare v public.teacher_appraisal_configs%rowtype; c jsonb; cats jsonb;
begin
 select * into v from public.teacher_appraisal_configs where name='LIB Teacher Appraisal' and status='published' order by version desc limit 1;
 if not found then raise exception 'Published Teacher Appraisal configuration not found'; end if;
 update public.teacher_appraisal_configs set status='archived' where id=v.id;
 select coalesce(jsonb_agg((cat - 'metrics') || jsonb_build_object('subcategories',jsonb_build_array(jsonb_build_object(
   'id',(cat->>'id') || '_general','name','General','weight',cat->'weight','metrics',coalesce(cat->'metrics','[]'::jsonb)
 ))) order by ord),'[]'::jsonb) into cats
 from jsonb_array_elements(v.config->'categories') with ordinality as x(cat,ord);
 c:=jsonb_set(v.config,'{categories}',cats,true);
 c:=jsonb_set(c,'{categories,4,subcategories,0,metrics,0,target}','3'::jsonb,true);
 c:=jsonb_set(c,'{categories,4,subcategories,0,metrics,1,target}','1'::jsonb,true);
 c:=jsonb_set(c,'{categories,4,subcategories,0,metrics,1,method}','"count_target"'::jsonb,true);
 insert into public.teacher_appraisal_configs(name,version,status,effective_from,config,notes,created_by,published_at)
 values(v.name,v.version+1,'published',current_date,c,'Nested category/subcategory/metric rules; calibrated feature adoption targets.',auth.uid(),now());
end $$;