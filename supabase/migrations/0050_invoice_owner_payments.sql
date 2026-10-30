-- =============================================================================
-- By the C — Migration 0050 · PAGAMENTOS DO OWNER numa invoice (parcial/total)
-- =============================================================================
-- Andrea (2026-09-25): "sometimes owners pay me a partial payment and not the
-- full amount. i need something like we do in the payments to display this
-- internally BUT it also needs to appear on the invoice if i have to send the
-- pdf to the owner again."
--
-- Hoje o único jeito é uma LINHA de item com category='credit' — foi assim que
-- ela lançou os $1.000 da invoice #166 ("Payment Received August 21, 2026", com
-- a DATA DIGITADA NA DESCRIÇÃO, porque não há campo). Sem data real, sem método,
-- sem saldo, e o invoice continua "unpaid" mesmo com dinheiro dentro.
--
-- Espelha o modelo que ela já conhece de Payments (payment_parts): cada
-- pagamento com valor, data e método próprios; status vira Partial; o saldo
-- aparece na tela E no PDF.
--
-- `deducted_from_payment_id`: quando o pagamento é o desconto no repasse do
-- aluguel ("subtract it for you automatically from payout"), guarda QUAL repasse
-- pagou essa invoice — assim a dedução é rastreável dos dois lados e nunca é
-- aplicada duas vezes no mesmo repasse (unique index abaixo).
-- =============================================================================

create table if not exists invoice_payments (
  id                       uuid primary key default gen_random_uuid(),
  invoice_id               uuid not null references invoices(id) on delete cascade,
  amount                   numeric(12,2) not null check (amount > 0),
  paid_at                  date not null default current_date,
  method                   text,           -- Zelle | Check | Cash | Rent deduction | Other
  notes                    text,
  -- Preenchido só quando method = 'Rent deduction'.
  deducted_from_payment_id uuid references payments(id) on delete set null,
  created_at               timestamptz not null default now(),
  created_by               uuid references profiles(id) on delete set null
);

comment on table invoice_payments is
  'Dinheiro que o OWNER pagou numa invoice — parcial ou total. Espelha payment_parts do aluguel. Aparece no painel interno E no PDF (Payments received + Balance Due).';
comment on column invoice_payments.deducted_from_payment_id is
  'Repasse de aluguel que quitou (parte d)esta invoice. Preenchido quando method = Rent deduction.';

create index if not exists idx_invoice_payments_invoice on invoice_payments (invoice_id, paid_at desc);
create index if not exists idx_invoice_payments_payout  on invoice_payments (deducted_from_payment_id);

-- Trava: o MESMO repasse não pode descontar a MESMA invoice duas vezes.
create unique index if not exists idx_invoice_payments_once_per_payout
  on invoice_payments (invoice_id, deducted_from_payment_id)
  where deducted_from_payment_id is not null;

alter table invoice_payments enable row level security;

-- Mesmo gate das invoices (espelha invoice_attachments_rw, migration 0010).
drop policy if exists invoice_payments_rw on invoice_payments;
create policy invoice_payments_rw on invoice_payments for all
  using (
    has_cap('financials.full')
    or ( has_cap('invoices.service')  and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'service') )
    or ( has_cap('invoices.seasonal') and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'seasonal') )
    or ( has_cap('invoices.general')  and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'general') )
  )
  with check (
    has_cap('financials.full')
    or ( has_cap('invoices.service')  and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'service') )
    or ( has_cap('invoices.seasonal') and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'seasonal') )
    or ( has_cap('invoices.general')  and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'general') )
  );

-- Recibo opcional por pagamento (reusa o anexo da invoice; null = anexo da invoice).
alter table invoice_attachments
  add column if not exists invoice_payment_id uuid references invoice_payments(id) on delete cascade;
comment on column invoice_attachments.invoice_payment_id is
  'Quando preenchido, o anexo é o RECIBO daquele pagamento do owner — não entra na seção de recibos do PDF combinado.';
create index if not exists idx_invoice_attachments_payment on invoice_attachments (invoice_payment_id);
