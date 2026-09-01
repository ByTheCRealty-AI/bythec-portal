-- =============================================================================
-- 0041_sale_commission_no_receivable.sql
-- Finances passa a LER a comissão de venda direto da propriedade
-- (properties.sale_commission, migration 0027) em vez de exigir que a Andrea
-- digite o valor de novo no deal do cliente (clients.sale_commission, 0026).
--
-- SEM etapa de "owed": comissão de venda sai na mesa do fechamento, não é conta
-- a receber como aluguel ou invoice. Casa vendida = comissão ganha, contada no
-- mês do fechamento (properties.sold_at, migration 0034). Regra da Andrea:
-- "i don't want it to appear as owed. once the house has been sold, then the
-- sales commission needs to be shown in the finances".
--
-- Por isso NÃO existe par received/received_at aqui (os outros streams têm:
-- payments.commission_paid, invoices.commission_collected). Nada a criar — esta
-- migration é registro da decisão. As colunas sale_commission_received /
-- _received_at chegaram a existir por algumas horas em 2026-08-27 e foram
-- removidas sem nenhum dado gravado (0 linhas marcadas).
--
-- Vendida = sale_status='sold' OU sold_at preenchido (a data pode ser registrada
-- antes de mexer no status; exigir os dois esconderia venda do Finances).
-- =============================================================================

alter table properties
  drop column if exists sale_commission_received,
  drop column if exists sale_commission_received_at;
