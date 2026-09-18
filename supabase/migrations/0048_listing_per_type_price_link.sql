-- =============================================================================
-- By the C — Migration 0048 · Preço E link POR TIPO de listing
-- =============================================================================
-- Andrea, 2026-09-18: "for every type of listing that exists there needs to be a
-- place for me to put a link to THAT type of listing. meaning if its vacation,
-- then its an airbnb, if its for sale its mls, etc. example of this is 28
-- seminole, its 3 types in listings so it needs 3 different links and the rate
-- or price needs to correspond to that type of listing. so on the for sale side,
-- its (900k for example) but for the winter rental side its (3,500/monthly)."
--
-- O modelo antigo tinha UM preço e DOIS links (airbnb_link, mls_link) por
-- listing. Com os tipos independentes (0040), uma casa temporada + inverno +
-- venda não cabia: o 28 Seminole mostrava $995.000 como se fosse o aluguel de
-- inverno, e o link do Airbnb não tinha onde morar.
--
-- Agora cada tipo tem o SEU preço e o SEU link. Os campos antigos continuam
-- existindo e são preenchidos por trigger (mesma ponte de `category` em 0040 e
-- `property_type` em 0042), porque o site público lê price/airbnb_link/mls_link.
-- =============================================================================

alter table listings add column if not exists price_for_sale   numeric(12,2);
alter table listings add column if not exists price_year_round numeric(12,2);
alter table listings add column if not exists price_vacation   numeric(12,2);
alter table listings add column if not exists price_winter     numeric(12,2);

alter table listings add column if not exists link_for_sale   text;
alter table listings add column if not exists link_year_round text;
alter table listings add column if not exists link_vacation   text;
alter table listings add column if not exists link_winter     text;

comment on column listings.price_for_sale is 'Preço de VENDA. Valor cheio (ex.: 900000), sem unidade.';
comment on column listings.price_year_round is 'Aluguel anual MENSAL. Exibido com /mo.';
comment on column listings.price_winter is 'Aluguel de inverno MENSAL. Exibido com /mo.';
comment on column listings.price_vacation is 'Diária/semana de temporada. Em branco = "Rates on Airbnb" (a diária muda todo dia; quem manda é o Airbnb).';
comment on column listings.link_vacation is 'Link do anuncio de TEMPORADA (Airbnb/VRBO).';
comment on column listings.link_for_sale is 'Link do anuncio de VENDA (MLS/CCIAOR).';
comment on column listings.price is 'DERIVADO por trigger do preço do tipo principal (for_sale > year_round > vacation > winter). Existe só pro site público atual. Não editar à mão.';
comment on column listings.airbnb_link is 'DERIVADO por trigger de link_vacation. Não editar à mão.';
comment on column listings.mls_link is 'DERIVADO por trigger (link_for_sale > link_year_round > link_winter). Não editar à mão.';

-- Backfill. O preço único de hoje pertence ao tipo PRINCIPAL (mesma precedência
-- da category). No 28 Seminole isso manda os $995.000 pro price_for_sale, que é
-- o certo — era preço de venda aparecendo como se fosse aluguel.
update listings set price_for_sale   = price where price is not null and is_for_sale   and price_for_sale   is null;
update listings set price_year_round = price where price is not null and is_year_round and not is_for_sale and price_year_round is null;
update listings set price_vacation   = price where price is not null and is_vacation   and not is_for_sale and not is_year_round and price_vacation is null;
update listings set price_winter     = price where price is not null and is_winter     and not is_for_sale and not is_year_round and not is_vacation and price_winter is null;

-- Links: Airbnb é sempre temporada. O MLS vai pro tipo principal que o usa.
update listings set link_vacation   = airbnb_link where airbnb_link is not null and link_vacation   is null;
update listings set link_for_sale   = mls_link    where mls_link is not null and is_for_sale   and link_for_sale   is null;
update listings set link_year_round = mls_link    where mls_link is not null and is_year_round and not is_for_sale and link_year_round is null;
update listings set link_winter     = mls_link    where mls_link is not null and is_winter     and not is_for_sale and not is_year_round and link_winter is null;

-- Trigger: os campos antigos seguem os novos, sempre.
create or replace function sync_listing_legacy_price_links() returns trigger as $$
begin
  new.price := coalesce(
    case when new.is_for_sale   then new.price_for_sale   end,
    case when new.is_year_round then new.price_year_round end,
    case when new.is_vacation   then new.price_vacation   end,
    case when new.is_winter     then new.price_winter     end
  );
  new.airbnb_link := new.link_vacation;
  new.mls_link := coalesce(
    case when new.is_for_sale   then new.link_for_sale   end,
    case when new.is_year_round then new.link_year_round end,
    case when new.is_winter     then new.link_winter     end
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_listing_legacy on listings;
-- Depois do trigger de category (0040) — a precedência aqui lê as flags is_*.
create trigger trg_sync_listing_legacy
  before insert or update on listings
  for each row execute function sync_listing_legacy_price_links();
