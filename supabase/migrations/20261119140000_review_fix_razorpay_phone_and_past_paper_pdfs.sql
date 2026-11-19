-- Review fixes 2026-11-19 (SQL 80). Safe to run more than once.
-- 1) razorpay_try_match: the 9 Nov version wrote '\\D' (matches a backslash + D) instead of '\D' (any non-digit),
--    so a booking phone like '+91 98765 43210' never matched the Razorpay payer's 10-digit number.
-- 2) Past paper PDFs: the restrictive storage rule qb_teacher_switch only lets Admin/Teacher touch the qb-papers
--    bucket, which cancels the 12 Nov read rule for Students/Parents. Add read-only room for them;
--    qb_papers_student_parent_read_published still limits them to published papers.

begin;
create or replace function public.razorpay_try_match(p_payment text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p public.razorpay_payments;
  hits text[];
begin
  select * into p from razorpay_payments where id = p_payment;
  if not found or p.match_status in ('matched', 'manual', 'ignored') then
    return p.match_status;
  end if;

  -- Prefer the exact booking order number carried in Razorpay notes/description.
  select array_agg(b.id::text) into hits
    from wix_demo_bookings b
   where not b.paid
     and length(coalesce(b.order_number, '')) >= 4
     and coalesce(p.notes::text, '') || ' ' || coalesce(p.description, '')
         ilike '%' || b.order_number || '%';

  -- Fallback: match the payer's mobile/email and the booking amount.
  -- Deliberately no time window: a parent may pay days after submitting a booking.
  -- If multiple unpaid bookings fit, keep the payment ambiguous for manual review.
  if coalesce(array_length(hits, 1), 0) = 0 then
    select array_agg(b.id::text) into hits
      from wix_demo_bookings b
     where not b.paid
       and (
         (coalesce(p.phone10, '') <> ''
           and right(regexp_replace(coalesce(b.phone, ''), '\D', '', 'g'), 10) = p.phone10)
         or (coalesce(p.email, '') <> ''
           and lower(trim(coalesce(b.email, ''))) = lower(trim(p.email)))
       )
       and p.amount >= coalesce(
         nullif(regexp_replace(coalesce(b.amount::text, ''), '[^0-9.]', '', 'g'), '')::numeric,
         100
       )
       and p.amount <= coalesce(
         nullif(regexp_replace(coalesce(b.amount::text, ''), '[^0-9.]', '', 'g'), '')::numeric,
         100
       ) * 1.05 + 1;
  end if;

  if coalesce(array_length(hits, 1), 0) = 1 then
    update wix_demo_bookings
       set paid = true,
           paid_at = p.captured_at,
           payment_id = p.id,
           paid_via = 'Razorpay'
     where id::text = hits[1];

    update razorpay_payments
       set booking_id = hits[1],
           match_status = 'matched'
     where id = p.id;

    return 'matched';
  end if;

  update razorpay_payments
     set match_status = case
       when coalesce(array_length(hits, 1), 0) > 1 then 'ambiguous'
       else 'unmatched'
     end
   where id = p.id;

  return case
    when coalesce(array_length(hits, 1), 0) > 1 then 'ambiguous'
    else 'unmatched'
  end;
end
$function$;

drop policy if exists qb_teacher_switch on storage.objects;
create policy qb_teacher_switch
on storage.objects
as restrictive
for all to authenticated
using (
  bucket_id not in ('qb-images', 'qb-papers', 'practice-answers')
  or (bucket_id = 'qb-papers' and qb_my_role() in ('Admin', 'Teacher') and (qb_my_role() = 'Admin' or qb_my_qb_access()))
  or (bucket_id = 'qb-papers' and qb_my_role() in ('Student', 'Parent'))
  or (bucket_id in ('qb-images', 'practice-answers')
      and (qb_my_role() is distinct from 'Teacher' or qb_my_qb_access()))
)
with check (
  bucket_id not in ('qb-images', 'qb-papers', 'practice-answers')
  or (bucket_id = 'qb-papers' and qb_my_role() in ('Admin', 'Teacher') and (qb_my_role() = 'Admin' or qb_my_qb_access()))
  or (bucket_id in ('qb-images', 'practice-answers')
      and (qb_my_role() is distinct from 'Teacher' or qb_my_qb_access()))
);

commit;
