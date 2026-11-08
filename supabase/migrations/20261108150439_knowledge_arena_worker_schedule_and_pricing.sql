begin;

create extension if not exists pg_net;

alter table public.ka_settings
  add column if not exists ai_input_usd_per_million numeric(12,6) not null default 1 check (ai_input_usd_per_million > 0),
  add column if not exists ai_output_usd_per_million numeric(12,6) not null default 5 check (ai_output_usd_per_million > 0),
  add column if not exists usd_inr_rate numeric(12,6) not null default 94.1402 check (usd_inr_rate > 0),
  add column if not exists ai_pricing_source text not null default 'Anthropic Claude Haiku 4.5 standard API pricing',
  add column if not exists fx_rate_as_of date not null default date '2026-11-06';

update public.ka_settings
set ai_input_usd_per_million=1,
    ai_output_usd_per_million=5,
    usd_inr_rate=94.1402,
    ai_pricing_source='Anthropic Claude Haiku 4.5 standard API pricing',
    fx_rate_as_of=date '2026-11-06',
    updated_at=now()
where id=1;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='ka_worker_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'ka_worker_secret',
      'Private authentication token used only by the Knowledge Arena scheduled worker.');
  end if;
end
$$;

create or replace function public.ka_verify_worker_secret(p_supplied text)
returns boolean
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare expected text;
begin
  if coalesce(auth.role(),'') <> 'service_role' or p_supplied is null or length(p_supplied) < 32 then
    return false;
  end if;
  select decrypted_secret into expected
  from vault.decrypted_secrets
  where name='ka_worker_secret'
  limit 1;
  return expected is not null and expected=p_supplied;
end;
$$;

revoke all on function public.ka_verify_worker_secret(text) from public, anon, authenticated;
grant execute on function public.ka_verify_worker_secret(text) to service_role;

create or replace function public.ka_invoke_worker()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, pg_temp
as $$
declare
  worker_secret text;
  request_id bigint;
begin
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name='ka_worker_secret'
  limit 1;
  if worker_secret is null then
    raise exception 'Knowledge Arena worker secret is not configured.';
  end if;

  select net.http_post(
    url := 'https://kqkojscbaycolaioyarh.supabase.co/functions/v1/knowledge-arena-worker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-ka-worker-secret',worker_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function public.ka_invoke_worker() from public, anon, authenticated, service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='knowledge-arena-worker' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('knowledge-arena-worker','*/5 * * * *','select public.ka_invoke_worker();');
end
$$;

commit;