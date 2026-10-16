-- =============================================================================
-- 0052_buyer_commission.sql
-- Comissão de COMPRA no cliente comprador (Andrea 2026-10-16: "i need to be able
-- to add my commission to a buyer. they obviously don't have a house so it's
-- just a client").
--
-- O lado vendedor guarda a comissão na propriedade (properties.sale_*, 0027).
-- O comprador não tem propriedade no sistema, então os mesmos três números
-- moram no próprio cliente:
--   purchase_price        — preço de compra (base da %)
--   sale_commission_rate  — % (ex.: 2.5)
--   sale_commission       — $ que vale (JÁ EXISTIA desde 0026, legado sem
--                           nenhum valor gravado; volta a ser usado aqui)
--
-- Mesma regra da venda (0041): sem etapa de "owed". Deal fechado
-- (deal_status='closed') = comissão ganha, contada no mês de deal_closed_at.
-- =============================================================================

alter table clients
  add column if not exists purchase_price numeric(12,2),
  add column if not exists sale_commission_rate numeric(6,3);

comment on column clients.purchase_price is 'Buyer side: purchase price (base for sale_commission_rate). 0052.';
comment on column clients.sale_commission_rate is 'Buyer side: commission % on purchase_price. 0052.';
comment on column clients.sale_commission is 'Buyer side: commission $ (the value that counts in Finances when deal_status=closed). Reused in 0052.';
