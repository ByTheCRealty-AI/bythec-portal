-- =============================================================================
-- COMMISSION PAID — flag manual por pagamento: a comissão da By the C desse
-- aluguel já foi paga/liquidada? Checkbox na tela de payments (coluna Commission).
-- Independente do status do pagamento (received) — é o repasse/acerto da comissão.
-- =============================================================================

alter table payments
  add column if not exists commission_paid boolean not null default false;
alter table payments
  add column if not exists commission_paid_at timestamptz;
comment on column payments.commission_paid is
  'By the C commission desse pagamento foi paga/liquidada. Toggle manual na tela de payments.';
