-- Make guest lead, session and consent recording one atomic database transaction.
begin;

create or replace function public.ka_register_guest_atomic(
  p_mobile_e164 text,
  p_guest_name text,
  p_grade_label text,
  p_session_token_hash text,
  p_expires_at timestamptz,
  p_enquiry_consent boolean,
  p_marketing_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.ka_guest_leads;
  v_session public.ka_guest_sessions;
  v_returning boolean := false;
  v_previous_enquiry boolean;
  v_previous_marketing boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorised';
  end if;
  if p_mobile_e164 is null or p_mobile_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Invalid international mobile number';
  end if;
  if p_guest_name is null or length(btrim(p_guest_name)) not between 2 and 80 then
    raise exception 'Invalid guest name';
  end if;
  if p_grade_label is null or length(btrim(p_grade_label)) not between 1 and 80 then
    raise exception 'Invalid grade';
  end if;
  if p_session_token_hash is null or p_session_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid session token hash';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '31 days' then
    raise exception 'Invalid guest session expiry';
  end if;

  -- Serialise concurrent registrations for the same parent mobile number.
  perform pg_advisory_xact_lock(hashtextextended(p_mobile_e164, 0));

  select * into v_lead
  from public.ka_guest_leads
  where mobile_e164 = p_mobile_e164
  for update;

  v_returning := found;
  if v_returning then
    v_previous_enquiry := v_lead.enquiry_consent;
    v_previous_marketing := v_lead.marketing_consent;
    update public.ka_guest_leads
    set enquiry_consent = coalesce(p_enquiry_consent, false),
        marketing_consent = coalesce(p_marketing_consent, false),
        last_guest_name = btrim(p_guest_name),
        last_grade_label = btrim(p_grade_label),
        last_seen_at = now(),
        last_activity_at = now(),
        updated_at = now()
    where id = v_lead.id
    returning * into v_lead;
  else
    insert into public.ka_guest_leads (
      mobile_e164, enquiry_consent, marketing_consent,
      last_guest_name, last_grade_label, last_seen_at, last_activity_at, updated_at
    ) values (
      p_mobile_e164, coalesce(p_enquiry_consent, false), coalesce(p_marketing_consent, false),
      btrim(p_guest_name), btrim(p_grade_label), now(), now(), now()
    )
    returning * into v_lead;
  end if;

  insert into public.ka_guest_sessions (
    lead_id, session_token_hash, guest_name, grade_label, expires_at
  ) values (
    v_lead.id, p_session_token_hash, btrim(p_guest_name), btrim(p_grade_label), p_expires_at
  )
  returning * into v_session;

  -- Record both initial choices, including an explicit false choice. On a
  -- returning lead, append only changed choices; never rewrite prior events.
  if not v_returning or v_previous_enquiry is distinct from coalesce(p_enquiry_consent, false) then
    insert into public.ka_guest_consents(lead_id, session_id, consent_type, granted, source)
    values (v_lead.id, v_session.id, 'enquiry', coalesce(p_enquiry_consent, false), 'knowledge_arena_guest');
  end if;
  if not v_returning or v_previous_marketing is distinct from coalesce(p_marketing_consent, false) then
    insert into public.ka_guest_consents(lead_id, session_id, consent_type, granted, source)
    values (v_lead.id, v_session.id, 'whatsapp_marketing', coalesce(p_marketing_consent, false), 'knowledge_arena_guest');
  end if;

  return jsonb_build_object(
    'lead_id', v_lead.id,
    'session_id', v_session.id,
    'guest_name', v_session.guest_name,
    'grade_label', v_session.grade_label,
    'expires_at', v_session.expires_at,
    'returning_lead', v_returning
  );
end;
$$;

revoke all on function public.ka_register_guest_atomic(text,text,text,text,timestamptz,boolean,boolean)
  from public, anon, authenticated;
grant execute on function public.ka_register_guest_atomic(text,text,text,text,timestamptz,boolean,boolean)
  to service_role;

commit;
