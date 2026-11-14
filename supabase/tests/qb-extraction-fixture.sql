-- Minimal disposable Supabase-compatible schema for QB extraction migration tests.
create extension if not exists pgcrypto;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.role() returns text language sql stable
as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
create table public.profiles(id uuid primary key,role text not null,archived boolean not null default false);
create table public.boards(id uuid primary key default gen_random_uuid(),name text not null);
create table public.grades(id uuid primary key default gen_random_uuid(),name text not null);
create table public.qb_schools(id uuid primary key default gen_random_uuid(),name text not null);
create table public.qb_passages(
 id uuid primary key default gen_random_uuid(),subject_name text not null,passage_text text not null,passage_type text,
 word_count integer,difficulty text default 'medium',source text,approved boolean not null default false,created_at timestamptz not null default now(),image_url text
);
create table public.qb_source_papers(
 id uuid primary key default gen_random_uuid(),
 status text not null default 'published',
 extraction_status text not null default 'pending',
 stored_pdf_url text,
 checksum text,
 grade_id uuid not null references public.grades(id),
 board_id uuid references public.boards(id),
 subject_name text not null,
 year integer not null,
 exam_type text not null default 'main',
 medium text not null default 'English',
 source_type text not null default 'board',
 school_id uuid references public.qb_schools(id),
 question_count integer
);
create table public.qb_questions(
 id uuid primary key default gen_random_uuid(),subject_name text not null,grade_id uuid not null,board_id uuid not null,
 chapter_id uuid,passage_id uuid references public.qb_passages(id),question_text text not null,question_image_url text,
 question_type text not null,marks numeric not null default 1,difficulty text not null default 'medium',answer_text text,
 answer_image_url text,explanation_text text,source_paper_id uuid references public.qb_source_papers(id),source_year integer,
 source_exam_type text,syllabus_status text not null default 'current',language text not null default 'Sanskrit',
 approved boolean not null default false,approved_by uuid,approved_at timestamptz,usage_count integer not null default 0,
 flag_count integer not null default 0,added_by uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 section text,section_label text,options jsonb,correct_option text,archived boolean not null default false,archived_at timestamptz,
 archived_by uuid,topic text,edited_by uuid,edited_at timestamptz
);
grant usage on schema public,auth to anon,authenticated,service_role;
grant usage on schema auth to service_role;
