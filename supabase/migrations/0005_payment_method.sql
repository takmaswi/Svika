-- =============================================================================
-- Svika · 0005_payment_method
-- Phase 3.7 — payment-choice flow.
-- Tickets carry whether they were paid from wallet credit or to be paid in cash
-- on board. Adds a mocked top_ups ledger so the demo can show wallet balance
-- changing without touching real fintech rails.
-- =============================================================================

-- ----- payment_method on tickets --------------------------------------------
alter table public.tickets
  add column if not exists payment_method text not null default 'wallet'
    check (payment_method in ('wallet', 'cash'));

create index if not exists tickets_payment_method_idx
  on public.tickets (payment_method);

-- ----- top_ups ledger -------------------------------------------------------
create table if not exists public.top_ups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  amount_usd  numeric(10,2) not null check (amount_usd > 0),
  created_at  timestamptz not null default now()
);

create index if not exists top_ups_user_id_idx
  on public.top_ups (user_id, created_at desc);
