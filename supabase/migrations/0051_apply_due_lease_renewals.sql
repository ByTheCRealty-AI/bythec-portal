-- 0051 — Renovação aceita vira contrato SOZINHA (Andrea 2026-10-02).
-- 15 dias antes do novo início: lembrete pra secretária (reminders).
-- No dia do novo início: rent_price + rental_start/end passam a valer e os
-- pagamentos mensais do novo contrato são criados (pula mês que já existe).
-- Sem cron: a função roda a cada carga do Overview (RPC) e é idempotente
-- (renewal_applied_at / renewal_reminder_at marcam o que já foi feito).
-- Fonte aplicada no banco em 2026-10-02 — ver a definição viva em
-- pg_get_functiondef('public.apply_due_lease_renewals'::regproc).
alter table properties add column if not exists renewal_applied_at date;
alter table properties add column if not exists renewal_reminder_at date;
