-- Allow teachers to read only demo bookings currently assigned to their own teacher profile.
-- Existing admin policies remain unchanged; no data or table schema is modified.
drop policy if exists "teacher_read_own_assigned_demo_bookings" on public.wix_demo_bookings;
create policy "teacher_read_own_assigned_demo_bookings"
on public.wix_demo_bookings
for select
to public
using (
  my_role() = 'Teacher'
  and scheduled_teacher_id = my_teacher_id()
);
