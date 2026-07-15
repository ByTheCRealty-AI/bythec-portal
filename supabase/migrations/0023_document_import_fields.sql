-- 0023: fields for the OneDrive document import + tenant re-tagging.
--   doc_date    date -- the document's REAL date (from the source file's modified time). Drives
--                       "newest on top, oldest on bottom" ordering, independent of import time.
--   source_path text -- the original OneDrive relative path. Provenance + idempotency: a re-run skips
--                       a file whose source_path is already imported (never double-inserts).
-- Both nullable; existing rows keep null (they sort by created_at as before). RLS unchanged.

alter table public.documents
  add column if not exists doc_date date,
  add column if not exists source_path text;

create index if not exists documents_source_path_idx on public.documents(source_path);
