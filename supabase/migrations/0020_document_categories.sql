-- 0020: Property document organization.
-- Adds to the polymorphic `documents` table (scope = properties for now):
--   category     text  -- doc-type tag. Column added now (future-ready); UI deferred per Andrea 2026-07-13.
--   tenant_id    uuid  -- FK clients(id) ON DELETE SET NULL: links a doc to a (possibly ARCHIVED) client.
--   tenant_label text  -- free-text past-tenant name (+ optional years) when they are NOT a client.
-- The existing `year` column stays. RLS is unchanged (operations.edit OR clients.edit OR properties.edit)
-- and needs no edit — these are row-level columns, not new policies.
-- ON DELETE SET NULL is deliberate: hard-deleting a client (admin_delete_client) must not be blocked by,
-- nor cascade-destroy, a property document — it just drops the tenant link.

alter table public.documents
  add column if not exists category text,
  add column if not exists tenant_id uuid references public.clients(id) on delete set null,
  add column if not exists tenant_label text;

create index if not exists documents_tenant_id_idx on public.documents(tenant_id);
