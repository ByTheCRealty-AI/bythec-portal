-- =============================================================================
-- By the C — Migration 0039 · LISTING PHOTOS (public bucket + gallery table)
-- =============================================================================
-- Andrea, 2026-08-21: the cover-photo URL field was useless to her — "the photos
-- i have are jpg, heic, etc". She uploads FILES. This adds real photo upload.
--
-- ⚠️ SECURITY — WHY A SECOND BUCKET:
-- The existing `documents` bucket is PRIVATE and holds invoices plus rental
-- application government IDs (PII, SSNs). Locked rule: it NEVER becomes public.
-- Listing photos must be world-readable to show on the website, so they get
-- their OWN bucket that holds nothing else. The two never mix.
--
-- The bucket is additionally constrained to image MIME types and 15 MB, so even
-- a bug or a mistyped path cannot park a PDF of an invoice in a public bucket.
--
-- HEIC: the browser converts HEIC to JPEG BEFORE upload (heic2any), because
-- browsers cannot render HEIC. 'image/heic' is still allowed in the MIME list as
-- a belt-and-braces fallback, but in practice the client always sends JPEG.
-- =============================================================================

-- 1) Public bucket, images only --------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-photos',
  'listing-photos',
  true,
  15728640, -- 15 MB
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Storage policies -------------------------------------------------------
-- Read is open: these are marketing photos meant for the public website.
drop policy if exists listing_photos_public_read on storage.objects;
create policy listing_photos_public_read on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'listing-photos');

-- Writing is staff-only, and scoped to this bucket.
drop policy if exists listing_photos_staff_write on storage.objects;
create policy listing_photos_staff_write on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (has_cap('listings.manage') or has_cap('operations.edit'))
  );

drop policy if exists listing_photos_staff_delete on storage.objects;
create policy listing_photos_staff_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and (has_cap('listings.manage') or has_cap('operations.edit'))
  );

-- 3) Gallery table ----------------------------------------------------------
create table if not exists listing_photos (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references listings(id) on delete cascade,
  storage_path  text not null,          -- path inside the listing-photos bucket
  url           text not null,          -- public URL (bucket is public)
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid references profiles(id) on delete set null
);
comment on table listing_photos is
  'Photos for a listing, in display order. CASCADE on listing delete: a permanently deleted listing takes its photo rows with it. The storage objects are removed by the app before the row goes (storage has its own delete trigger and is not reachable by SQL).';

create index if not exists idx_listing_photos_listing on listing_photos (listing_id, sort_order);

alter table listing_photos enable row level security;

-- Anyone who can see the listing can see its photos; staff who manage listings
-- can add and remove them.
drop policy if exists listing_photos_select on listing_photos;
create policy listing_photos_select on listing_photos
  for select
  using (has_cap('listings.view') or has_cap('listings.manage') or has_cap('operations.edit'));

drop policy if exists listing_photos_write on listing_photos;
create policy listing_photos_write on listing_photos
  for all
  using (has_cap('listings.manage') or has_cap('operations.edit'))
  with check (has_cap('listings.manage') or has_cap('operations.edit'));

-- 4) Keep listings.cover_photo_url in step with the first photo --------------
-- The public website already reads cover_photo_url. Syncing it here means the
-- gallery works on the site with NO website change: whatever photo sits first
-- IS the cover. Reordering or deleting re-points it automatically.
create or replace function sync_listing_cover() returns trigger as $$
declare
  v_listing uuid := coalesce(new.listing_id, old.listing_id);
  v_url text;
begin
  select url into v_url
    from listing_photos
   where listing_id = v_listing
   order by sort_order asc, created_at asc
   limit 1;

  update listings set cover_photo_url = v_url, updated_at = now()
   where id = v_listing;

  return null; -- AFTER trigger; return value is ignored
end;
$$ language plpgsql security definer set search_path to 'public';

drop trigger if exists trg_sync_listing_cover on listing_photos;
create trigger trg_sync_listing_cover
  after insert or update or delete on listing_photos
  for each row execute function sync_listing_cover();
