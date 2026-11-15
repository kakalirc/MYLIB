-- Explicit, paper-scoped destructive reset for failed Question Bank PDF extractions.
-- Source paper/PDF metadata and published Question Bank records are never deleted.
create or replace function public.qb_reset_paper_extraction(
  p_source_paper_id uuid,
  p_admin_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paper public.qb_source_papers%rowtype;
  v_linked_questions integer;
  v_active_runs integer;
  v_runs integer;
  v_requests integer;
  v_pages integer;
  v_staging integer;
begin
  if p_source_paper_id is null or p_admin_id is null then
    raise exception 'A source paper and authenticated Admin are required';
  end if;

  select * into v_paper
  from public.qb_source_papers
  where id = p_source_paper_id
  for update;
  if not found then raise exception 'Source paper not found'; end if;
  if v_paper.status <> 'published' then raise exception 'Only a published source paper can be reset'; end if;

  select count(*) into v_linked_questions
  from public.qb_questions
  where source_paper_id = p_source_paper_id;
  if v_linked_questions > 0 or coalesce(v_paper.extraction_status, 'not_started') = 'extracted' then
    raise exception 'Reset blocked: published Question Bank questions are linked to this paper';
  end if;

  perform 1 from public.qb_paper_extraction_runs
  where source_paper_id = p_source_paper_id
  for update;
  select count(*) into v_active_runs
  from public.qb_paper_extraction_runs
  where source_paper_id = p_source_paper_id
    and status in ('queued','processing')
    and lease_expires_at > now();
  if v_active_runs > 0 then
    raise exception 'Reset blocked: an extraction worker still owns an active lease. Wait for it to finish or expire, then inspect again.';
  end if;

  select count(*) into v_runs from public.qb_paper_extraction_runs where source_paper_id=p_source_paper_id;
  select count(*) into v_requests from public.qb_paper_extraction_requests r
    join public.qb_paper_extraction_runs x on x.id=r.run_id where x.source_paper_id=p_source_paper_id;
  select count(*) into v_pages from public.qb_paper_extraction_pages p
    join public.qb_paper_extraction_runs x on x.id=p.run_id where x.source_paper_id=p_source_paper_id;
  select count(*) into v_staging from public.qb_paper_extraction_staging s
    join public.qb_paper_extraction_runs x on x.id=s.run_id where x.source_paper_id=p_source_paper_id;

  delete from public.qb_paper_extraction_staging s using public.qb_paper_extraction_runs x
    where s.run_id=x.id and x.source_paper_id=p_source_paper_id
      and s.published_question_id is null and s.published_passage_id is null;

  if exists (
    select 1 from public.qb_paper_extraction_staging s
    join public.qb_paper_extraction_runs x on x.id=s.run_id
    where x.source_paper_id=p_source_paper_id
      and (s.published_question_id is not null or s.published_passage_id is not null)
  ) then
    raise exception 'Reset blocked: staged items are already linked to published content';
  end if;

  delete from public.qb_paper_extraction_requests r using public.qb_paper_extraction_runs x
    where r.run_id=x.id and x.source_paper_id=p_source_paper_id;
  delete from public.qb_paper_extraction_pages p using public.qb_paper_extraction_runs x
    where p.run_id=x.id and x.source_paper_id=p_source_paper_id;
  delete from public.qb_paper_extraction_runs where source_paper_id=p_source_paper_id;

  update public.qb_source_papers
  set extraction_status='not_started', question_count=0
  where id=p_source_paper_id;

  return jsonb_build_object(
    'ok',true,'source_paper_id',p_source_paper_id,
    'deleted_runs',v_runs,'deleted_requests',v_requests,
    'deleted_pages',v_pages,'deleted_staging',v_staging,
    'source_paper_preserved',true,'published_questions_preserved',true
  );
end;
$$;

revoke all on function public.qb_reset_paper_extraction(uuid,uuid) from public, anon, authenticated;
grant execute on function public.qb_reset_paper_extraction(uuid,uuid) to service_role;
