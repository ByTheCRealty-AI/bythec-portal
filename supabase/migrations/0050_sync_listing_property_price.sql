-- 0050 — Preço casado entre LISTING e PROPERTY (Andrea 2026-10-01):
-- "não quero ter que mudar o preço na página da propriedade E na de listings".
-- Pares que significam a MESMA coisa:
--   listing.price_year_round <-> property.rent_price  (casa anual)
--   listing.price_winter     <-> property.rent_price  (SÓ quando a casa NÃO é anual —
--       aluguel de inverno e anual são números diferentes; numa casa que é as duas,
--       o anual manda e o inverno fica só na listing)
--   listing.price_for_sale   <-> property.sale_price
-- price_vacation fica só na listing (a diária vive no Airbnb).
-- Nunca apaga: nulo de um lado não zera o outro. pg_trigger_depth() corta o eco.
-- O legacy listings.price continua derivado pelo trigger sync_listing_legacy_price_links.

create or replace function public.sync_price_listing_to_property()
returns trigger language plpgsql set search_path = public as $$
declare rent numeric;
begin
  if pg_trigger_depth() > 1 or new.property_id is null then return null; end if;
  rent := coalesce(new.price_year_round,
                   case when new.is_winter and not new.is_year_round then new.price_winter end);
  update properties p
     set rent_price = coalesce(rent, p.rent_price),
         sale_price = case when new.is_for_sale then coalesce(new.price_for_sale, p.sale_price) else p.sale_price end
   where p.id = new.property_id
     and (p.rent_price is distinct from coalesce(rent, p.rent_price)
       or p.sale_price is distinct from case when new.is_for_sale then coalesce(new.price_for_sale, p.sale_price) else p.sale_price end);
  return null;
end;
$$;

drop trigger if exists trg_sync_price_listing_to_property on public.listings;
create trigger trg_sync_price_listing_to_property
  after insert or update of price_year_round, price_winter, price_for_sale, property_id, is_year_round, is_winter, is_for_sale
  on public.listings for each row execute function public.sync_price_listing_to_property();

create or replace function public.sync_price_property_to_listing()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  update listings l
     set price_year_round = case when l.is_year_round then coalesce(new.rent_price, l.price_year_round) else l.price_year_round end,
         price_winter     = case when l.is_winter and not l.is_year_round then coalesce(new.rent_price, l.price_winter) else l.price_winter end,
         price_for_sale   = case when l.is_for_sale then coalesce(new.sale_price, l.price_for_sale) else l.price_for_sale end
   where l.property_id = new.id and l.archived_at is null;
  return null;
end;
$$;

drop trigger if exists trg_sync_price_property_to_listing on public.properties;
create trigger trg_sync_price_property_to_listing
  after update of rent_price, sale_price on public.properties
  for each row execute function public.sync_price_property_to_listing();
