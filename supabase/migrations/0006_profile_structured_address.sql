-- =============================================================================
-- By the C — Migration 0006 · Endereço estruturado em profiles
-- =============================================================================
-- O formulário de Users & Access deixa de usar 1 campo único "address" e passa
-- a usar campos separados: street, apt/unit, city, state, zip.
-- Mantemos a coluna `address` existente (não removida) e fazemos backfill do
-- street a partir dela, pra não perder nada do que já estava gravado.
-- =============================================================================

alter table profiles add column if not exists address_line1 text;  -- street
alter table profiles add column if not exists address_line2 text;  -- apt/unit/suite (opcional)
alter table profiles add column if not exists city          text;
alter table profiles add column if not exists state         text;
alter table profiles add column if not exists zip           text;

comment on column profiles.address_line1 is 'Endereço pessoal — rua/número. Substitui o uso do campo address no form.';
comment on column profiles.address_line2 is 'Endereço pessoal — apto/unidade/suíte (opcional).';
comment on column profiles.city  is 'Endereço pessoal — cidade.';
comment on column profiles.state is 'Endereço pessoal — estado.';
comment on column profiles.zip   is 'Endereço pessoal — ZIP.';

-- Backfill: não perder o endereço antigo. Onde address_line1 está vazio e
-- address tem conteúdo, copia address -> address_line1.
update profiles
   set address_line1 = address
 where address_line1 is null
   and address is not null;
