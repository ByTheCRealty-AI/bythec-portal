-- =============================================================================
-- By the C — Migration 0040 · UMA listing pode ter VÁRIOS tipos
-- =============================================================================
-- Andrea, 2026-08-21: "some homes are vacation and winter, some will be winter
-- only, some will be vacation only."
--
-- O modelo antigo dava UM `category` por listing, então "vacation E winter" era
-- impossível de representar. Ela confirmou que QUALQUER combinação vale (uma
-- casa à venda pode estar alugada ao mesmo tempo — acontece no ramo).
--
-- Vira 4 flags independentes, o MESMO padrão que `properties` já usa pras
-- aplicações de aluguel (accepts_year_round / accepts_winter, migration 0036).
--
-- `category` CONTINUA existindo e é derivada por trigger. Motivo: o site público
-- (website/src/lib/listings.ts) escolhe a aba lendo `category`, e a Andrea pediu
-- explicitamente pra NÃO mexer no site agora. Mantendo category preenchida, o
-- site segue funcionando sem uma linha de mudança.
--
-- PRECEDÊNCIA da category derivada: for_sale > year_round > vacation > winter.
-- Uma casa à venda E alugada aparece na aba For Sale — vender é a manchete.
-- Isso é uma PONTE, não o destino: quando o site ganhar abas separadas
-- (decisão dela: "separate tabs eventually"), ele passa a ler as flags direto e
-- uma listing poderá aparecer em mais de uma aba.
-- =============================================================================

alter table listings add column if not exists is_for_sale   boolean not null default false;
alter table listings add column if not exists is_year_round boolean not null default false;
alter table listings add column if not exists is_vacation   boolean not null default false;
alter table listings add column if not exists is_winter     boolean not null default false;

comment on column listings.is_vacation is 'Anunciada como aluguel de temporada (verão/Airbnb). Pode ser true junto com is_winter.';
comment on column listings.is_winter   is 'Anunciada como aluguel de inverno / off-season. Pode ser true junto com is_vacation.';
comment on column listings.category    is
  'DERIVADA das flags is_* por trigger (precedência for_sale > year_round > vacation > winter). Existe só pra o site público atual, que escolhe a aba por ela. Não editar à mão — escreva nas flags.';

-- Backfill: quem já tinha category vira a flag equivalente.
update listings set is_for_sale   = true where category = 'for_sale'          and is_for_sale   = false;
update listings set is_year_round = true where category = 'year_round_rental' and is_year_round = false;
update listings set is_vacation   = true where category = 'vacation_rental'   and is_vacation   = false;
update listings set is_winter     = true where category = 'off_season_rental' and is_winter     = false;

-- Nenhuma flag marcada (listing antiga sem category): cai em year-round, que é
-- o caso mais comum da carteira. Melhor um default sensato do que sumir dos filtros.
update listings
   set is_year_round = true
 where not (is_for_sale or is_year_round or is_vacation or is_winter);

-- Trigger: category e listing_type seguem as flags, sempre.
create or replace function sync_listing_category() returns trigger as $$
begin
  -- Nunca deixar a listing sem tipo nenhum (o form valida, mas o banco é a rede).
  if not (new.is_for_sale or new.is_year_round or new.is_vacation or new.is_winter) then
    new.is_year_round := true;
  end if;

  new.category := case
    when new.is_for_sale   then 'for_sale'::property_type
    when new.is_year_round then 'year_round_rental'::property_type
    when new.is_vacation   then 'vacation_rental'::property_type
    else 'off_season_rental'::property_type
  end;

  -- listing_type separa venda de aluguel no site.
  new.listing_type := case when new.is_for_sale then 'sale'::listing_type else 'rental'::listing_type end;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_listing_category on listings;
create trigger trg_sync_listing_category
  before insert or update on listings
  for each row execute function sync_listing_category();

create index if not exists idx_listings_types
  on listings (is_for_sale, is_year_round, is_vacation, is_winter);
