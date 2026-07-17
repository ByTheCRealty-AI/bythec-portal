-- 0026: sales/brokerage commission earned per deal (Finances stream #4).
-- On the buy/sell client (the deal). sale_commission = $ By the C earns on that
-- closed deal; sale_commission_received = whether it's been paid to By the C.
-- Owner/manager enter these in Finances for closed deals. Nullable/default false.
alter table public.clients
  add column if not exists sale_commission numeric,
  add column if not exists sale_commission_received boolean not null default false;
