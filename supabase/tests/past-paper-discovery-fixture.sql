-- Minimal Supabase-compatible schema for the Past Paper Discovery migration smoke test.
create extension if not exists pgcrypto;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
create table public.profiles (
  id uuid primary key,
  role text not null,
  admin_name text,
  username text
);
create table public.boards (id uuid primary key default gen_random_uuid(), name text not null);
create table public.grades (id uuid primary key default gen_random_uuid(), name text not null);
create table public.qb_schools (id uuid primary key default gen_random_uuid(), name text not null);
create table public.qb_source_papers (id uuid primary key default gen_random_uuid(), checksum text);
create or replace function public.qb_my_role() returns text
language sql stable security definer set search_path = public
as $$ select p.role from public.profiles p where p.id = auth.uid() $$;
create or replace function public.qb_my_qb_access() returns boolean
language sql stable security definer set search_path = public
as $$ select true $$;
grant execute on function public.qb_my_role() to authenticated;
grant execute on function public.qb_my_qb_access() to authenticated;
