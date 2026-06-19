-- =============================================================================
-- 0007 — Clients: structured billing address (city / state / zip)
-- =============================================================================
-- A tabela clients já tem billing_address (street) e billing_address2 (apt/unit).
-- Adiciona as partes estruturadas que faltavam, espelhando o tratamento de
-- profiles (0006). Idempotente: pode rodar mais de uma vez sem erro.
-- Sem backfill: registros antigos mantêm o endereço solto em billing_address.
-- =============================================================================

alter table clients add column if not exists billing_city  text;
alter table clients add column if not exists billing_state text;
alter table clients add column if not exists billing_zip   text;

comment on column clients.billing_city  is 'Cidade do endereço de cobrança (estruturado). NUNCA do Google.';
comment on column clients.billing_state is 'Estado/UF do endereço de cobrança (estruturado).';
comment on column clients.billing_zip   is 'ZIP do endereço de cobrança (estruturado).';
