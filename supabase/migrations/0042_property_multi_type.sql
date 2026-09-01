-- =============================================================================
-- By the C — Migration 0042 · UMA propriedade pode ter VÁRIOS tipos
-- =============================================================================
-- Andrea, 2026-08-27: "properties that are both vacation rentals and winter
-- rentals, year round rentals and for sale, vacation rental and winter rental
-- and for sale."
--
-- O modelo antigo dava UM `property_type` por casa, então "temporada E inverno"
-- ou "anual E à venda" era impossível de representar — o jeito de registrar era
-- duplicar a propriedade, que é exatamente a duplicata que ela quer eliminar.
--
-- Mesmo padrão já aplicado em `listings` na migration 0040. Aqui a ponte é o
-- próprio `property_type`, que continua existindo e vira DERIVADO por trigger:
-- 35 pontos do app leem essa coluna, e mantê-la preenchida evita quebrar tudo
-- de uma vez. Os FILTROS, porém, precisam migrar pras flags — senão uma casa
-- "anual + à venda" derivaria pra for_sale e sumiria da tela de Payments.
--
-- NÃO confundir com accepts_year_round / accepts_winter (migration 0036): aquilo
-- é "aceita aplicação de aluguel pra essa temporada", coisa do formulário
-- público /apply. Isto aqui é o que a casa É.
--
-- PRECEDÊNCIA do derivado: for_sale > year_round > vacation > winter — igual
-- 0040, pra as duas tabelas contarem a mesma história.
-- =============================================================================

alter table properties add column if not exists is_for_sale   boolean not null default false;
alter table properties add column if not exists is_year_round boolean not null default false;
alter table properties add column if not exists is_vacation   boolean not null default false;
alter table properties add column if not exists is_winter     boolean not null default false;

comment on column properties.is_vacation is 'Aluguel de temporada (verão/Airbnb). Pode ser true junto com is_winter e is_for_sale.';
comment on column properties.is_winter   is 'Aluguel de inverno / off-season. Pode ser true junto com is_vacation.';
comment on column properties.is_for_sale is 'Está à venda. Uma casa alugada PODE estar à venda ao mesmo tempo.';
comment on column properties.property_type is
  'DERIVADO das flags is_* por trigger (precedência for_sale > year_round > vacation > winter). Mantido pra não quebrar leituras antigas. NÃO editar à mão — escreva nas flags. Filtros devem usar as flags, não esta coluna.';

-- Backfill: o tipo único vira a flag equivalente.
update properties set is_year_round = true where property_type = 'year_round_rental' and is_year_round = false;
update properties set is_vacation   = true where property_type = 'vacation_rental'   and is_vacation   = false;
update properties set is_winter     = true where property_type = 'off_season_rental' and is_winter     = false;
update properties set is_for_sale   = true where property_type = 'for_sale'          and is_for_sale   = false;

-- Rede de segurança: sem nenhuma flag cai em year-round (caso mais comum da
-- carteira — 31 das 41 casas ativas).
update properties
   set is_year_round = true
 where not (is_for_sale or is_year_round or is_vacation or is_winter);

create or replace function sync_property_type() returns trigger as $$
begin
  if not (new.is_for_sale or new.is_year_round or new.is_vacation or new.is_winter) then
    new.is_year_round := true;
  end if;

  new.property_type := case
    when new.is_for_sale   then 'for_sale'::property_type
    when new.is_year_round then 'year_round_rental'::property_type
    when new.is_vacation   then 'vacation_rental'::property_type
    else 'off_season_rental'::property_type
  end;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_property_type on properties;
create trigger trg_sync_property_type
  before insert or update on properties
  for each row execute function sync_property_type();

create index if not exists idx_properties_types
  on properties (is_for_sale, is_year_round, is_vacation, is_winter);
