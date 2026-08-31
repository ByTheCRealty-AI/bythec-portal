-- =============================================================================
-- By the C — Migration 0041 · nota de falha do resgate de recibos
-- =============================================================================
-- 515 recibos de pagamento ainda moram no CDN do Bubble; o portal só guarda o
-- link. A rotina de resgate (/payments/receipts) copia cada arquivo pro bucket
-- privado `documents` e repõe o file_url.
--
-- Esta coluna existe por UM motivo: se um arquivo não puder ser copiado (o
-- Bubble não tem mais, timeout), a linha continua com file_url começando com
-- http — ou seja, o seletor de lote pegaria ela DE NOVO, pra sempre. Com a nota
-- gravada, o lote pula essa linha e o loop termina. O botão "tentar de novo"
-- limpa as notas.
-- =============================================================================

alter table payment_attachments add column if not exists migration_note text;

comment on column payment_attachments.migration_note is
  'Set when the Bubble-CDN rescue could not copy this file (404, timeout, etc). Rows with a note are skipped by the batch picker so one bad file cannot loop forever. Cleared on a successful copy. NULL = never failed.';

create index if not exists idx_payment_attachments_offsite
  on payment_attachments (id) where file_url like 'http%';
