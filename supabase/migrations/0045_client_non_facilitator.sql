-- =============================================================================
-- 0045_client_non_facilitator.sql
-- "Non-Client Facilitator" é um SUB-TIPO (tag em cima do tipo) do CLIENTE, não só
-- da property. By the C fez um serviço ÚNICO (achar inquilino / facilitar a venda)
-- por uma taxa única, e o dono gerencia o imóvel/inquilino sozinho — não é cliente
-- de gestão. Aplica a landlord (year-round/winter) E buy/sell. A property (0044) já
-- tem os mesmos campos; aqui espelhamos no cliente pro caso buy/sell sem imóvel.
-- =============================================================================

alter table clients add column if not exists non_facilitator boolean not null default false;
alter table clients add column if not exists nf_fee_type text;   -- 'percent' | 'flat' | 'one_month_rent'
alter table clients add column if not exists nf_fee_value numeric;

comment on column clients.non_facilitator is 'Non-Client Facilitator: serviço único (taxa única), dono auto-gerencia. Tag em cima do tipo (landlord/buy-sell).';
comment on column clients.nf_fee_type is 'percent | flat | one_month_rent.';
comment on column clients.nf_fee_value is 'Valor da taxa única (% ou $). null quando one_month_rent.';
