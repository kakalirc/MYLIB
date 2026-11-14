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
create table public.qb_passages(id uuid primary key default gen_random_uuid());
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
 id uuid primary key default gen_random_uuid(),
 source_paper_id uuid references public.qb_source_papers(id)
);
grant usage on schema public,auth to anon,authenticated,service_role;
grant usage on schema auth to service_role;
