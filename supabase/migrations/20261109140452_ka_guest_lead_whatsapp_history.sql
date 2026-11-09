create table if not exists public.ka_guest_lead_whatsapp_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.ka_guest_leads(id) on delete cascade,
  phone_number text not null,
  message_text text not null,
  send_status text not null default 'opened' check (send_status in ('opened','sent')),
  opened_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ka_guest_lead_whatsapp_history_lead_opened_idx
  on public.ka_guest_lead_whatsapp_history (lead_id, opened_at desc);

alter table public.ka_guest_lead_whatsapp_history enable row level security;
revoke all on public.ka_guest_lead_whatsapp_history from anon, authenticated;
grant all on public.ka_guest_lead_whatsapp_history to service_role;
