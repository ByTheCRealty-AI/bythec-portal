-- =============================================================================
-- PROVIDER CONTACT FIELDS + PREFERRED (star)
--   name  = business name (relabel na UI)
--   phone = office number (relabel na UI)
--   + contact_person  = point of contact (pessoa preferida)
--   + contact_phone   = numero dessa pessoa
--   + preferred       = provider starred (topo da lista + estrela)
-- service_type continua text, mas a UI vira dropdown (lista canônica).
-- =============================================================================

alter table service_providers
  add column if not exists contact_person text,
  add column if not exists contact_phone text,
  add column if not exists preferred boolean not null default false;
comment on column service_providers.contact_person is 'Point of contact (pessoa preferida). name=business name; phone=office number; contact_phone=numero dessa pessoa.';
comment on column service_providers.preferred is 'Provider preferido (starred). Estrela + topo da lista.';
