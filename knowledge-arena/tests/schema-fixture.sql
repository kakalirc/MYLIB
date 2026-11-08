-- Disposable CI-only Supabase-compatible fixture. Never run against LIB production.
create extension if not exists pgcrypto;
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end
$$;

create table auth.users (
  id uuid primary key
);

create or replace function auth.role()
returns text language sql stable
as $$ select current_setting('request.jwt.claim.role', true) $$;

create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;

create table public.profiles (
  id uuid primary key references auth.users(id),
  role text not null,
  linked_student_id uuid
);

create table public.grades (
  id uuid primary key,
  name text not null unique
);

create table public.students (
  id uuid primary key,
  grade_id uuid references public.grades(id)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create or replace function public.my_role()
returns text language sql stable
as $$ select coalesce(current_setting('request.jwt.claim.role', true),'') $$;

-- Minimal baseline data required by the schema preflight.
insert into public.grades(id,name)
values ('10000000-0000-0000-0000-000000000001','Class 1');
insert into public.subjects(name) values ('Mathematics'),('Science');
insert into auth.users(id)
values ('20000000-0000-0000-0000-000000000001');
insert into public.students(id,grade_id) values (
  '30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'
);
insert into public.profiles(id,role,linked_student_id) values (
  '20000000-0000-0000-0000-000000000001','Student','30000000-0000-0000-0000-000000000001'
);
