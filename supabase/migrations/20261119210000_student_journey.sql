-- Student Journey (SQL 81): where each student came from, and when/why they left.
-- Entered only in Student Maintenance (Add student, the student's page, Archive student).
-- Safe to run more than once.

alter table public.students
  add column if not exists lead_source      text,  -- e.g. 'LIB website', 'Referral', 'Before the app'; blank = worked out from linked records
  add column if not exists lead_source_note text,  -- e.g. who referred them
  add column if not exists left_on          date,  -- set when the student is archived
  add column if not exists left_reason      text,
  add column if not exists left_note        text;

-- Knowledge Arena leads are only reachable through the Arena's own server function.
-- This read-only list lets the admin Student Journey page count Arena enquiries and link
-- converted leads to students. Admins only; no mobile numbers or names leave the table.
create or replace function public.admin_ka_leads_for_journey()
returns table (id uuid, converted_student_id uuid, first_seen_at timestamptz, lead_status text, games_completed integer)
language sql stable security definer set search_path = public as $$
  select l.id, l.converted_student_id, l.first_seen_at, l.lead_status, l.games_completed::integer
  from public.ka_guest_leads l
  where public.my_role() = 'Admin';
$$;
revoke all on function public.admin_ka_leads_for_journey() from public, anon;
grant execute on function public.admin_ka_leads_for_journey() to authenticated;
