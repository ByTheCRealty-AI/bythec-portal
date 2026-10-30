-- =============================================================================
-- By the C — Migration 0053 · PUBLIC read of listing_photos (website gallery)
-- =============================================================================
-- Context: the `listing-photos` storage bucket is already public (0039) and
-- active listings are publicly readable (0033). But the listing_photos TABLE —
-- which maps a listing to its ordered photo URLs — was staff-only, so the public
-- website (anon key) could show the single cover_photo_url but NOT the full
-- gallery. This adds an anon READ policy, scoped to photos of ACTIVE, non-archived
-- listings only, so a draft/archived listing's photos never leak.
--
-- SAFE / ADDITIVE: existing staff policies (0039) are untouched; SELECT policies
-- are OR'd. No write access for anon. Apply with 0033 at website go-live.
-- =============================================================================

drop policy if exists listing_photos_public_read on listing_photos;
create policy listing_photos_public_read on listing_photos
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from listings l
      where l.id = listing_photos.listing_id
        and l.active = true
        and l.archived_at is null
    )
  );

grant select on listing_photos to anon, authenticated;
