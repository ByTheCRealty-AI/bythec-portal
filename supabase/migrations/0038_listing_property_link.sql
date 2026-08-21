-- =============================================================================
-- By the C — Migration 0038 · LINK listing → property
-- =============================================================================
-- Andrea, 2026-08-21: "many of the listings are properties that already exist in
-- the system under properties. so i want to be able to pull that address."
--
-- Most listings advertise a property we already manage. Retyping the address is
-- wasted work and drifts (two spellings of the same house). This adds a real FK
-- so the listing form can pull the address — and the owner, category, rent and
-- photo — straight from the property record.
--
-- ON DELETE SET NULL, deliberately: a listing must survive its property being
-- hard-deleted (admin_delete_property). It just becomes a standalone listing
-- with the address text it already copied, instead of vanishing or blocking the
-- delete. Same reasoning as documents.tenant_id in migration 0020.
--
-- NOTE: address is COPIED into the listing at pick time, not read through the
-- FK. The listing is a marketing document — it keeps saying what it said even
-- if the property record is later edited or removed.
-- =============================================================================

alter table listings
  add column if not exists property_id uuid references properties(id) on delete set null;

comment on column listings.property_id is
  'Optional link to the managed property this listing advertises. Used by the portal form to pull address/owner/category. Address is copied at pick time, not joined at read time. NEVER exposed publicly — the owner behind it is internal.';

create index if not exists idx_listings_property on listings (property_id);
