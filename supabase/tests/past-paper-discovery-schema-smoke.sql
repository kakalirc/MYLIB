-- Run after the discovery migration in a disposable PostgreSQL database.
\set ON_ERROR_STOP on
insert into public.profiles (id, role, admin_name, username) values
  ('10000000-0000-4000-8000-000000000001', 'Admin', 'Test Admin', 'admin'),
  ('10000000-0000-4000-8000-000000000002', 'Teacher', null, 'teacher');
insert into public.qb_paper_discovery_candidates
  (source_type, source_domain, title, source_url)
values ('board', 'cbseacademic.nic.in', 'CBSE Class 10 Sanskrit 2025', 'https://cbseacademic.nic.in/sample.pdf');

-- The migration must seed official board domains and enforce the explicit import link.
do $$
begin
  if (select count(*) from public.qb_paper_discovery_sources where trust_level = 'official') < 4 then
    raise exception 'Expected four official board sources to be seeded';
  end if;
  if has_table_privilege('authenticated', 'public.qb_paper_discovery_candidates', 'INSERT') then
    raise exception 'Authenticated users must not insert discovery candidates directly';
  end if;
  begin
    insert into public.qb_paper_discovery_candidates
      (source_type, source_domain, title, source_url, status)
    values ('board', 'cbseacademic.nic.in', 'Invalid imported row', 'https://cbseacademic.nic.in/invalid.pdf', 'imported');
    raise exception 'Imported candidate without imported_paper_id was accepted';
  exception when check_violation then null;
  end;
end $$;

-- Admin can manage approved sources and read candidate rows.
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
insert into public.qb_paper_discovery_sources
  (display_name, domain, source_type, trust_level)
values ('CI Test School', 'school.example.edu', 'school', 'review');
do $$
begin
  if (select count(*) from public.qb_paper_discovery_candidates) <> 1 then
    raise exception 'Admin should see the candidate review queue';
  end if;
end $$;

-- Teacher must not see Admin-only sources/candidates or manage source domains.
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
do $$
begin
  if (select count(*) from public.qb_paper_discovery_candidates) <> 0 then
    raise exception 'Teacher unexpectedly read discovery candidates';
  end if;
  if (select count(*) from public.qb_paper_discovery_sources) <> 0 then
    raise exception 'Teacher unexpectedly read the source registry';
  end if;
  begin
    insert into public.qb_paper_discovery_sources
      (display_name, domain, source_type, trust_level)
    values ('Unauthorized', 'unauthorized.example.edu', 'school', 'review');
    raise exception 'Teacher unexpectedly inserted a discovery source';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
