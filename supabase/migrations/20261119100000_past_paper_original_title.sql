-- Preserve the original paper name from discovery and uploaded PDF filenames.
alter table public.qb_source_papers
  add column if not exists paper_title text;

-- Prefer the source title for online-discovered papers.
update public.qb_source_papers as paper
set paper_title = candidate.title
from public.qb_paper_discovery_candidates as candidate
where candidate.imported_paper_id = paper.id
  and nullif(btrim(paper.paper_title), '') is null
  and nullif(btrim(candidate.title), '') is not null;

-- Recover names from existing manually uploaded PDF paths. The uploader prefixes
-- the sanitized original filename with a UUID to keep storage paths unique.
update public.qb_source_papers
set paper_title = trim(regexp_replace(
  regexp_replace(
    regexp_replace(split_part(stored_pdf_url, '/', array_length(string_to_array(stored_pdf_url, '/'), 1)),
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-', '', 'i'),
    '\\.pdf$', '', 'i'),
  '[-_]+', ' ', 'g'))
where nullif(btrim(paper_title), '') is null
  and stored_pdf_url is not null
  and stored_pdf_url like '%/%.pdf';

-- Automatically preserve the uploaded filename for future manual uploads. Discovery
-- imports supply paper_title explicitly, so their source title is not overwritten.
create or replace function public.qb_set_source_paper_title_from_file()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  file_name text;
begin
  if nullif(btrim(new.paper_title), '') is not null or new.stored_pdf_url is null then
    return new;
  end if;

  file_name := split_part(new.stored_pdf_url, '/', array_length(string_to_array(new.stored_pdf_url, '/'), 1));
  file_name := regexp_replace(file_name,
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-', '', 'i');
  file_name := regexp_replace(file_name, '\\.pdf$', '', 'i');
  file_name := trim(regexp_replace(file_name, '[-_]+', ' ', 'g'));

  if length(file_name) > 0 then
    new.paper_title := left(file_name, 500);
  end if;
  return new;
end;
$$;

drop trigger if exists qb_source_papers_set_title_from_file on public.qb_source_papers;
create trigger qb_source_papers_set_title_from_file
before insert or update of stored_pdf_url, paper_title on public.qb_source_papers
for each row execute function public.qb_set_source_paper_title_from_file();

comment on column public.qb_source_papers.paper_title is
  'Original display title: uploaded PDF filename for manual uploads, or source title for online discovery.';
