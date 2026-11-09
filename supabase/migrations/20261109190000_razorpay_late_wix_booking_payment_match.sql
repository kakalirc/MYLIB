-- Match captured Razorpay payments to existing Wix demo bookings even when
-- the parent pays well after the booking was created.
-- Razorpay's signed payment.captured webhook remains the source of truth.
-- Exact order-number matches take priority. Contact/amount matching is automatic
-- only when exactly one unpaid booking matches; ambiguous payments remain for
-- Admin review and are never assigned to an arbitrary booking.

begin;

-- A manual Admin toggle is not proof of a Razorpay capture. Preserve the
-- existing audit fields, but return non-Razorpay paid flags to the unpaid queue
-- so a later verified Razorpay payment can still be matched to that booking.
update public.wix_demo_bookings
   set paid = false
 where paid is true
   and (paid_via is distinct from 'Razorpay' or payment_id is null);

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
           and right(regexp_replace(coalesce(b.phone, ''), '\\D', '', 'g'), 10) = p.phone10)
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

commit;
