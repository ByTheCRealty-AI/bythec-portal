-- =============================================================================
-- By the C — Migration 0009 · Seasonal commission BASE (per-property)
-- =============================================================================
-- Contexto/regra (confirmada pela Andrea): a comissão By the C de SEASONAL é uma
-- % aplicada sobre uma BASE que varia POR CASA:
--   - MAIORIA das casas: % sobre o "Total Host Payout" (host_payout).
--   - ALGUMAS casas (ex.: Rainbow #335): % sobre o "Total Paid by Guest".
-- Antes a fórmula sempre usava o total pago pelo hóspede; agora a base é
-- escolhida por property (default 'host_payout') e confirmável por invoice.
--
-- TRAVADO (regras que esta migration sustenta):
--   - properties.seasonal_commission_base define a base padrão da casa.
--   - properties.seasonal_commission_rate (já existe, 0008) continua o % (0.10 default).
--   - invoices.commission_base + invoices.commission_rate guardam o que FOI usado
--     no cálculo (auditoria/trava por invoice). bythec_commission já guarda o valor.
--
-- IMPORTANTE: aplicar via Supabase MCP (o Victor não tem acesso ao banco).
-- RLS já existe (0005) e NÃO é tocada aqui.
-- Idempotente (add column if not exists; check constraint guardada pra reaplicar).
-- =============================================================================

-- 1) Base da comissão na PROPERTY. Default 'host_payout' (maioria das casas).
alter table properties
  add column if not exists seasonal_commission_base text not null default 'host_payout';

comment on column properties.seasonal_commission_base is
  'Base do % da comissão seasonal By the C: ''host_payout'' (maioria) ou ''paid_by_guest'' (ex.: Rainbow). Default host_payout. Editável por invoice.';

-- Check constraint guardado: só adiciona se ainda não existir (reaplicação segura).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'properties_seasonal_commission_base_chk'
  ) then
    alter table properties
      add constraint properties_seasonal_commission_base_chk
      check (seasonal_commission_base in ('host_payout', 'paid_by_guest'));
  end if;
end $$;

-- 2) Auditoria no INVOICE: base + rate efetivamente usados no cálculo.
--    Nullable (invoices antigos não têm; o detalhe cai pra base da property).
alter table invoices add column if not exists commission_base text;
alter table invoices add column if not exists commission_rate numeric;

comment on column invoices.commission_base is
  'SEASONAL: base usada no cálculo da comissão (''host_payout'' | ''paid_by_guest''). Travado por invoice. Null = invoice antigo (usa a base da property).';
comment on column invoices.commission_rate is
  'SEASONAL: fração do % de comissão usada no cálculo (ex.: 0.10). Travado por invoice. bythec_commission guarda o valor já calculado.';

-- Check guardado no invoice (aceita null pros antigos).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_commission_base_chk'
  ) then
    alter table invoices
      add constraint invoices_commission_base_chk
      check (commission_base is null or commission_base in ('host_payout', 'paid_by_guest'));
  end if;
end $$;

-- 3) Backfill conhecido: Rainbow (#335) usa base 'paid_by_guest'.
--    Match por endereço (case-insensitive). Seguro: só toca quem casa o nome.
--    Se o endereço exato divergir, ajustar o LIKE — NÃO chutar outras casas.
update properties
   set seasonal_commission_base = 'paid_by_guest'
 where lower(coalesce(address_text, address)) like '%rainbow%'
   and seasonal_commission_base <> 'paid_by_guest';
