-- =============================================================================
-- RENT COLLECTION (year-round / off-season) — quem coleta o aluguel:
--   'bythec' = By the C coleta do tenant e paga o owner (menos comissao). Default.
--   'owner'  = owner coleta do tenant e REMETE a comissao pra By the C.
-- Rastreio de rent + comissao e o MESMO nos dois (aluguel mensal, regime de caixa);
-- muda a direcao do dinheiro e o label da comissao (kept vs received from owner).
-- =============================================================================

alter table properties
  add column if not exists rent_collection text not null default 'bythec'
  check (rent_collection in ('bythec', 'owner'));
comment on column properties.rent_collection is
  'bythec = By the C coleta e paga o owner (menos comissao); owner = owner coleta e remete a comissao. Default bythec.';
