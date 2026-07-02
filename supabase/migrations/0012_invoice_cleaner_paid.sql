-- =============================================================================
-- CLEANER PAID — flag manual por invoice de temporada: quando o cleaning fee vai
-- pra By the C (cleaning_goes_to = 'bythec'), a By the C fica responsável por
-- pagar o cleaner. Este toggle marca que esse pagamento já foi feito.
-- Interno (só na tela) — NÃO aparece na invoice impressa/PDF.
-- Espelha o padrão de payments.commission_paid.
-- =============================================================================

alter table invoices
  add column if not exists cleaner_paid boolean not null default false;
alter table invoices
  add column if not exists cleaner_paid_at timestamptz;
comment on column invoices.cleaner_paid is
  'Seasonal + cleaning_goes_to=bythec: o cleaner ja foi pago pela By the C. Toggle manual, interno (nao vai pro PDF).';
