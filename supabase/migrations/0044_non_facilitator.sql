-- =============================================================================
-- 0044_non_facilitator.sql
-- Serviço NÃO-facilitador: taxa ÚNICA (one-time) em vez da comissão padrão, pra
-- compra/venda e landlords de aluguel year-round/winter. Guardado na PROPERTY
-- (fonte única) e editável tanto na página da propriedade quanto na do cliente.
--   fee_type: 'percent' (% do preço de venda p/ buy-sell) | 'flat' ($ fixo) |
--             'one_month_rent' (um mês de aluguel, p/ landlord)
--   fee_value: o número (% ou $). null quando 'one_month_rent'.
-- =============================================================================

alter table properties add column if not exists non_facilitator boolean not null default false;
alter table properties add column if not exists nf_fee_type text;   -- 'percent' | 'flat' | 'one_month_rent'
alter table properties add column if not exists nf_fee_value numeric;

comment on column properties.non_facilitator is 'Serviço não-facilitador (taxa única em vez de comissão padrão). Buy/sell + landlords YR/winter.';
comment on column properties.nf_fee_type is 'percent (% do preço/venda) | flat ($ fixo) | one_month_rent (um mês de aluguel).';
comment on column properties.nf_fee_value is 'Valor da taxa única (% ou $). null quando one_month_rent.';
