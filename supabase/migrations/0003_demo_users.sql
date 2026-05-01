-- =============================================================================
-- Svika · 0003_demo_users — pre-seeded demo personas. No real auth this sprint.
-- IDs are stable so the persona resolver in lib/personas.ts can match by name.
-- =============================================================================

insert into public.users (id, name, phone, role, credit_balance_usd) values
  ('00000000-0000-0000-0000-000000000001', 'Takunda',    '+263700000010', 'passenger',   5),
  ('00000000-0000-0000-0000-000000000002', 'Rudo',       '+263700000011', 'passenger',   2),
  ('00000000-0000-0000-0000-000000000003', 'Farai',      '+263700000012', 'conductor',   0),
  ('00000000-0000-0000-0000-000000000004', 'Baba Tino',  '+263700000013', 'fleet_owner', 0)
on conflict (phone) do nothing;
