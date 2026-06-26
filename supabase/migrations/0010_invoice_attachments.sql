-- =============================================================================
-- INVOICE ATTACHMENTS — anexar PDFs/imagens a uma invoice (recibo Airbnb/VRBO,
-- Stripe, etc.). Usados pra gerar o PDF COMBINADO (invoice + recibos) que a
-- Andrea sobe no eDeluxe. Bucket privado `documents` (mesmo dos recibos de
-- pagamento). RLS espelha o acesso de invoices (full / service / seasonal por kind).
-- =============================================================================

create table if not exists invoice_attachments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id) on delete cascade,
  file_url     text not null,         -- object path no bucket `documents`
  file_name    text,
  content_type text,                  -- application/pdf, image/jpeg, ...
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
comment on table invoice_attachments is
  'Anexos por invoice (recibos Airbnb/VRBO/Stripe). Entram no PDF combinado. Bucket documents.';
create index if not exists idx_invoice_attachments_invoice on invoice_attachments (invoice_id);

alter table invoice_attachments enable row level security;
drop policy if exists invoice_attachments_rw on invoice_attachments;
create policy invoice_attachments_rw on invoice_attachments for all
  using (
    has_cap('financials.full')
    or ( has_cap('invoices.service')  and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'service') )
    or ( has_cap('invoices.seasonal') and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'seasonal') )
  )
  with check (
    has_cap('financials.full')
    or ( has_cap('invoices.service')  and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'service') )
    or ( has_cap('invoices.seasonal') and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'seasonal') )
  );
