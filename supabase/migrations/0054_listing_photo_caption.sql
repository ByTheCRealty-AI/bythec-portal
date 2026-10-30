-- =============================================================================
-- By the C — Migration 0054 · listing photo captions
-- =============================================================================
-- Optional per-photo caption, edited in the portal's listing photo screen and
-- shown under the photo in the public website gallery. Additive & nullable.
-- =============================================================================

alter table listing_photos add column if not exists caption text;
comment on column listing_photos.caption is
  'Optional caption shown under the photo in the public website gallery. Null = no caption.';
