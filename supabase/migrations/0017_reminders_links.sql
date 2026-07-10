-- =============================================================================
-- By the C — Migration 0017 · Reminders — link opcional a cliente E/OU propriedade
-- =============================================================================
-- O 0015 tinha só um link polimórfico (parent_type/parent_id). Andrea quer poder
-- anexar UMA PESSOA (cliente: owner/tenant/etc) E/OU UMA PROPRIEDADE no mesmo
-- lembrete — os dois são independentes e ambos opcionais. Duas colunas dedicadas
-- resolvem melhor que o polimórfico único.
--
-- on delete set null: se o cliente/propriedade for hard-deleted (owner-only), o
-- lembrete permanece e só perde o vínculo (nunca bloqueia a exclusão).
-- parent_type/parent_id ficam no schema (inertes) pra não quebrar nada.
-- =============================================================================

alter table reminders
  add column if not exists client_id   uuid references clients(id)    on delete set null,
  add column if not exists property_id uuid references properties(id) on delete set null;

create index if not exists idx_reminders_client_id   on reminders (client_id);
create index if not exists idx_reminders_property_id on reminders (property_id);

comment on column reminders.client_id   is 'Link opcional a um cliente (owner/tenant/etc). Independente de property_id.';
comment on column reminders.property_id is 'Link opcional a uma propriedade. Independente de client_id.';
