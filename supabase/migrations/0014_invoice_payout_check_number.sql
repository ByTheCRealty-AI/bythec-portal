-- =============================================================================
-- CHECK NUMBER (payout) — quando owner/cleaner é pago por Check ou eCheck, guarda
-- o número do cheque. Só aparece na UI quando o método é Check/eCheck. Interno.
-- =============================================================================

alter table invoices
  add column if not exists owner_check_number text;
alter table invoices
  add column if not exists cleaner_check_number text;
comment on column invoices.owner_check_number is
  'Número do cheque do owner payout (só relevante quando owner_payment_method in (Check, eCheck)).';
comment on column invoices.cleaner_check_number is
  'Número do cheque do cleaner payout (só relevante quando cleaner_payment_method in (Check, eCheck)).';
