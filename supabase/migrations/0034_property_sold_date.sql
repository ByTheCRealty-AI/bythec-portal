-- =============================================================================
-- 0034_property_sold_date.sql
-- Data editável de "vendido" pra listings For Sale. Antes: a property tinha
-- sale_status (active|pending|sold|expired) mas NENHUMA data. Agora a Andrea pode
-- registrar/corrigir a data em que a casa foi vendida na página da propriedade.
-- (A comissão de venda no Finances continua vindo do deal do cliente buy/sell via
-- clients.deal_closed_at — este campo é registro da listing, não muda receita.)
-- =============================================================================

alter table properties add column if not exists sold_at date;
comment on column properties.sold_at is 'For Sale: data em que a casa foi vendida (editável na página da propriedade). Registro da listing; não dirige a receita do Finances.';
