-- Add 'general' to the invoice kind enum (simple one-off charge invoices).
-- Must be its OWN migration: Postgres forbids USING a new enum value in the same
-- transaction that adds it (the RLS in 0031 references 'general'::invoice_kind).
alter type invoice_kind add value if not exists 'general';
