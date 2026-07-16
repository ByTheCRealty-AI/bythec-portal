-- 0024: manual document ordering (owner + manager only).
-- sort_order: when set, drives the order of a property's documents within each
-- tenant group (ascending). NULL = fall back to doc_date desc (import/default order).
-- Nullable so existing docs keep date ordering until a human reorders them.
alter table public.documents
  add column if not exists sort_order double precision;
