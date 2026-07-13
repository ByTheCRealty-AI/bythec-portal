-- =============================================================================
-- By the C — Migration 0018 · Owner Payouts (aluguel year-round / off-season)
-- =============================================================================
-- Pro arranjo "By the C collects" (properties.rent_collection = 'bythec'): a By
-- the C coleta o aluguel e DEVE ao owner a parte dele (≈ rent − commission).
-- Rastrear, POR pagamento mensal recebido, se o owner já foi pago, com método
-- (eCheck | Zelle | Cash | Other), nº do eCheck e um recibo opcional.
--
-- Espelha o padrão do payout de invoice de temporada (migrations 0013/0014):
-- colunas owner_* em payments + category no anexo pra separar recibo do inquilino
-- (rent_receipt) do recibo do repasse (owner_payout).
--
-- Aplicar via Supabase MCP. Idempotente (add column if not exists).
-- =============================================================================

alter table payments
  add column if not exists owner_paid           boolean not null default false,
  add column if not exists owner_paid_at        timestamptz,
  add column if not exists owner_payment_method text,   -- eCheck | Zelle | Cash | Other
  add column if not exists owner_check_number   text;

comment on column payments.owner_paid is 'Repasse ao owner feito? Só relevante quando a propriedade é rent_collection=bythec e o pagamento foi recebido.';

-- Anexos: separar recibo do inquilino (rent_receipt) do recibo do repasse ao
-- owner (owner_payout). Linhas existentes viram rent_receipt (prova do inquilino).
alter table payment_attachments
  add column if not exists category text not null default 'rent_receipt'
    check (category in ('rent_receipt','owner_payout'));

comment on column payment_attachments.category is 'rent_receipt = prova do inquilino (coluna Receipt); owner_payout = recibo do repasse ao owner.';
