-- =============================================================================
-- PARTIAL RENT PAYMENTS — registrar parcelas que o inquilino paga contra UM
-- aluguel (monthly / first_month / last_month). O status do payment continua
-- due|received (sem novo valor de enum): "Partial" é DERIVADO no cliente
-- (status='due' AND amount_paid>0). Comissão só conta quando RECEIVED, então
-- a regra de caixa (comissão só no pago integral) sai de graça: o payment só
-- vira received quando amount_paid >= rent_amount.
-- =============================================================================

-- Soma corrente das parcelas registradas. Mantida pelas server actions
-- (recomputePaymentFromParts) a cada add/edit/delete de parcela.
alter table payments
  add column if not exists amount_paid numeric(12,2) not null default 0;
comment on column payments.amount_paid is
  'Soma das payment_parts não-arquivadas. status só vira received quando amount_paid >= rent_amount. Comissão conta só no received (regra de caixa).';

-- Pagamentos parciais (installments) feitos pelo inquilino contra um aluguel.
create table if not exists payment_parts (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references payments(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  paid_at      date not null,
  method       text,                  -- Zelle / Check / Cash / eCheck (DPX) / Stripe / ...
  notes        text,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
comment on table payment_parts is
  'Pagamentos parciais de um aluguel. Cada parcela pode ter seus próprios comprovantes (payment_attachments.payment_part_id). O pai vira received quando a soma fecha o rent_amount.';
create index if not exists idx_payment_parts_payment on payment_parts (payment_id);

-- Comprovante pode pertencer a uma PARCELA específica (além do payment). Nulo =
-- comprovante a nível de payment (caminho legado/Bubble + add de pagamento cheio).
alter table payment_attachments
  add column if not exists payment_part_id uuid references payment_parts(id) on delete cascade;
create index if not exists idx_payment_attachments_part on payment_attachments (payment_part_id);

-- RLS: mesmo gate de payments (financials.full OU payments.annual + payment existe).
alter table payment_parts enable row level security;
drop policy if exists payment_parts_rw on payment_parts;
create policy payment_parts_rw on payment_parts for all
  using (
    has_cap('financials.full')
    or ( has_cap('payments.annual') and exists (select 1 from payments p where p.id = payment_id) )
  )
  with check (
    has_cap('financials.full')
    or ( has_cap('payments.annual') and exists (select 1 from payments p where p.id = payment_id) )
  );
