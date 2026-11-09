-- Expand Knowledge Arena guest lead phone validation from India-only to E.164 international numbers.
begin;

alter table public.ka_guest_leads
  drop constraint if exists ka_guest_leads_mobile_e164_check;

alter table public.ka_guest_leads
  add constraint ka_guest_leads_mobile_e164_check
  check (mobile_e164 ~ '^+[1-9][0-9]{7,14}$');

commit;
