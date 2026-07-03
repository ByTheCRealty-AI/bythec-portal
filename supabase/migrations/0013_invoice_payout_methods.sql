-- =============================================================================
-- PAYOUT METHODS + RECEIPTS (seasonal) — como a By the C pagou o OWNER e o
-- CLEANER, com recibo opcional. Interno (não vai pro PDF do invoice).
--  - invoices.owner_payment_method  / cleaner_payment_method: eCheck/Check/Cash/
--    Zelle/Stripe/Other (texto livre, dropdown na UI).
--  - "owner pago" REUSA o flag existente invoices.paid (decisão da Andrea).
--  - "cleaner pago" usa cleaner_paid (migration 0012).
--  - invoice_attachments.category: separa recibo do hóspede (entra no PDF
--    combinado) dos recibos de repasse owner/cleaner (internos, fora do PDF).
-- =============================================================================

alter table invoices
  add column if not exists owner_payment_method text;
alter table invoices
  add column if not exists cleaner_payment_method text;
comment on column invoices.owner_payment_method is
  'Seasonal: como o owner payout foi pago (eCheck/Check/Cash/Zelle/Stripe/Other). Interno.';
comment on column invoices.cleaner_payment_method is
  'Seasonal + cleaning_goes_to=bythec: como o cleaner foi pago. Interno.';

alter table invoice_attachments
  add column if not exists category text not null default 'guest_receipt'
  check (category in ('guest_receipt', 'owner_payout', 'cleaner_payout'));
comment on column invoice_attachments.category is
  'guest_receipt (entra no PDF combinado) | owner_payout | cleaner_payout (recibos internos de repasse, NAO entram no PDF).';
