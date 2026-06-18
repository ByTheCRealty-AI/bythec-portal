-- =============================================================================
-- By the C — seed.sql · DADOS FICTÍCIOS para demo.
-- NÃO são dados reais da Andrea. Endereços/nomes inventados (Cape Cod-style).
-- Rodado automaticamente por `supabase start` / `supabase db reset`.
-- =============================================================================

-- Clientes (entidade-mãe) -----------------------------------------------------
insert into clients (id, name, client_type, deal_side, email, phone, billing_address, billing_address2, co_client_name, notes)
values
  ('11111111-1111-1111-1111-111111111111', 'John Carpenter',  'airbnb_owner', null,
   'john.carpenter@example.com', '+1 508-555-0101', '742 Ocean View Rd, Falmouth MA 02540', null,
   'Mary Carpenter', 'Dono de duas casas de temporada. Prefere repasse por eCheck.'),

  ('22222222-2222-2222-2222-222222222222', 'Helena Borges',   'landlord', null,
   'helena.borges@example.com', '+1 508-555-0142', '15 Pine Hill Ave, Hyannis MA 02601', 'Apt 2B',
   null, 'Aluguel anual. Cheque da comissão no dia 5.'),

  ('33333333-3333-3333-3333-333333333333', 'Daniel Souza',    'buy_sell_client', 'buyer',
   'daniel.souza@example.com', '+1 774-555-0188', '88 Bay State Dr, Sandwich MA 02563', null,
   null, 'Comprador procurando casa até $850k em Sandwich.'),

  ('44444444-4444-4444-4444-444444444444', 'Patricia Lima',   'tenant', null,
   'patricia.lima@example.com', '+1 508-555-0173', null, null,
   null, 'Inquilina year-round na Pine Hill.');

-- Papel extra: Helena também é tenant em outra unidade (papéis múltiplos).
insert into client_roles (client_id, role) values
  ('22222222-2222-2222-2222-222222222222', 'tenant');

-- Propriedades (penduradas no owner) -----------------------------------------
insert into properties (id, owner_id, address, address2, address_text, property_type, commission_fee, tenant_id, rent_price, rental_start, rental_end, rent_due_day, rent_frequency, notes)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '12 Rainbow Ave, East Falmouth MA 02536', null, '12 rainbow ave east falmouth',
   'vacation_rental', 12.50, null, null, null, null, null, null,
   'Casa Airbnb. Hot tub (manutenção extra recorrente).'),

  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '5 Seagull Ln, Falmouth MA 02540', null, '5 seagull ln falmouth',
   'vacation_rental', 12.50, null, null, null, null, null, null,
   'Segunda casa de temporada do John.'),

  ('aaaaaaaa-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222',
   '15 Pine Hill Ave, Hyannis MA 02601', 'Unit 1', '15 pine hill ave unit 1 hyannis',
   'year_round_rental', null, '44444444-4444-4444-4444-444444444444', 3000.00,
   '2026-01-01', '2026-12-31', 5, 'monthly',
   'Aluguel anual. Comissão 10% = $300/mês. Inquilina: Patricia.');

-- Prestador de serviço (alfabético na listagem) ------------------------------
insert into service_providers (name, service_type, phone, notify_via)
values
  ('Braga Brothers Plumbing', 'plumber', '+1 508-555-0900', 'whatsapp'),
  ('Cape Cod Electric', 'electrician', null, 'email');

-- =============================================================================
-- NOTA: invoices/payments/requests NÃO são semeados aqui de propósito —
-- os módulos correspondentes ainda são placeholders nesta rodada. A demo
-- foca em Clientes + Propriedades funcionais.
-- =============================================================================
