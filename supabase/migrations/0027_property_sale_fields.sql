-- 0027: For Sale properties — list/sale price + By the C's sale commission.
--   sale_price           numeric -- what the house is being sold for
--   sale_commission_rate numeric -- optional %, e.g. 2.5 (drives the $ in the UI)
--   sale_commission      numeric -- By the C's commission on the sale, in dollars (authoritative)
-- All nullable; only used when property_type = 'for_sale'.
alter table public.properties
  add column if not exists sale_price numeric,
  add column if not exists sale_commission_rate numeric,
  add column if not exists sale_commission numeric;
