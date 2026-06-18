-- =============================================================================
-- By the C — Migration 0003 · Operação + conteúdo polimórfico
-- tenant_requests, service_providers, services, listings,
-- notes (polimórfico), documents (polimórfico)
-- =============================================================================
-- REGRAS TRAVADAS (origem: requisitos módulos 4,5,10,11):
--  - service_providers: phone/email OPCIONAIS; listar SEMPRE alfabético.
--  - tenant_requests / services: status open|done; done arquiva (done_at).
--  - listings: PODE ser deletado de verdade (≠ archive de property), mas
--    mantemos soft-delete por consistência — diferença documentada.
--  - notes/documents: polimórficos (parent_type+parent_id) p/ client/property/listing.
--    documents com year p/ filtro (preferido a archive: casas acumulam 200 docs).
-- =============================================================================

create type request_status as enum ('open', 'done');
create type notify_via     as enum ('whatsapp', 'email');
create type listing_type    as enum ('rental', 'sale');
-- Tipo do "pai" das tabelas polimórficas.
create type parent_type     as enum ('client', 'property', 'listing');

-- =============================================================================
-- SERVICE PROVIDERS — encanador, eletricista, landscaper, HVAC...
-- =============================================================================
create table service_providers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  service_type  text,                  -- 'plumber', 'electrician', 'landscaper'...
  phone         text,                  -- OPCIONAL
  email         text,                  -- OPCIONAL
  notify_via    notify_via not null default 'email',
  notes         text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table service_providers is 'Cadastro de prestadores. phone/email opcionais. Listar SEMPRE alfabético (order by name).';

-- =============================================================================
-- TENANT REQUESTS — manutenção pedida pelo inquilino.
-- =============================================================================
create table tenant_requests (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references properties(id) on delete restrict,
  tenant_id    uuid references clients(id) on delete set null,  -- auto-preenchido
  date         date not null default current_date,
  description  text not null,
  status       request_status not null default 'open',
  done_at      timestamptz,           -- preenchido quando status -> done (arquiva)
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on column tenant_requests.tenant_id is 'Auto-preenchido a partir da propriedade (tenant + endereço). NUNCA deixar em branco.';
comment on column tenant_requests.done_at   is 'Done arquiva (vira histórico). status=done + done_at preenchido.';

-- Anexos multimídia do request (fotos/vídeo/PDF, vários).
create table tenant_request_attachments (
  id                uuid primary key default gen_random_uuid(),
  tenant_request_id uuid not null references tenant_requests(id) on delete cascade,
  file_url          text not null,
  file_name         text,
  content_type      text,
  archived_at       timestamptz,
  created_at        timestamptz not null default now()
);

-- =============================================================================
-- SERVICES — ordem de serviço. Liga request + propriedade + provider.
-- =============================================================================
create table services (
  id                   uuid primary key default gen_random_uuid(),
  tenant_request_id    uuid references tenant_requests(id)  on delete set null,
  property_id          uuid not null references properties(id) on delete restrict,
  provider_id          uuid references service_providers(id) on delete set null,
  service_request_date date,                  -- já combinado com o provider
  description          text,
  status               request_status not null default 'open',
  done_at              timestamptz,
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table service_attachments (
  id           uuid primary key default gen_random_uuid(),
  service_id   uuid not null references services(id) on delete cascade,
  file_url     text not null,        -- fotos do conserto subidas pelo provider
  file_name    text,
  content_type text,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- =============================================================================
-- LISTINGS — anúncio (alimenta o site público). PODE ser deletado de verdade.
-- =============================================================================
-- Diferença documentada: PROPERTY nunca é deletada (é dado operacional, archive).
-- LISTING é material de marketing efêmero (casa saiu do mercado) — o requisito
-- pede "delete button". Mantemos archived_at por consistência de UI/soft-delete,
-- MAS um hard DELETE de listing é aceitável (não quebra integridade de finanças).
-- =============================================================================
create table listings (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references clients(id) on delete set null,  -- dono
  address         text not null,
  address2        text,                  -- unidade, da base — NUNCA do Google
  description     text,
  available_date  date,
  airbnb_link     text,
  mls_link        text,
  listing_id      text,                  -- ID externo (MLS/Airbnb)
  price           numeric(12,2),
  listing_type    listing_type not null default 'rental',  -- rental | sale (diferencia no site)
  listing_status  listing_status not null default 'active',
  active          boolean not null default true,   -- aparece no tab Vacation Rentals
  featured        boolean not null default false,  -- aparece na home
  cover_photo_url text,
  -- Specs
  bedrooms        integer,
  bathrooms       integer,
  half_baths      integer,
  garage          integer,
  guests          integer,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table listings is 'Anúncio do site. Diferente de property: PODE ser deletado de verdade (delete button). Soft-delete mantido por consistência de UI.';
comment on column listings.listing_type is 'rental|sale — diferencia casas à venda × aluguel no site.';

-- =============================================================================
-- NOTES (polimórfico) — notas internas (não vão ao cliente).
-- =============================================================================
create table notes (
  id           uuid primary key default gen_random_uuid(),
  parent_type  parent_type not null,
  parent_id    uuid not null,
  body         text not null,
  year         integer,               -- p/ filtro
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  -- TRAVADO: nota é registro/liability. Editar mantém a data original (created_at).
  updated_at   timestamptz not null default now()
);
comment on table notes is 'Notas internas polimórficas (client/property/listing). Editar mantém created_at (liability).';

-- =============================================================================
-- DOCUMENTS (polimórfico) — multi-upload, multimídia, filtro por ano.
-- =============================================================================
create table documents (
  id           uuid primary key default gen_random_uuid(),
  parent_type  parent_type not null,
  parent_id    uuid not null,
  file_url     text not null,         -- Storage: bucket "documents"
  file_name    text,
  content_type text,                  -- foto/PDF/vídeo (inclui HEIC)
  year         integer,               -- filtro por ano (preferido a archive)
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
comment on table documents is 'Documentos polimórficos. Filtro por ANO preferido a archive (casas com 5-10 anos acumulam 200 docs).';

-- Índices --------------------------------------------------------------------
create index idx_service_providers_archived on service_providers (archived_at);
create index idx_service_providers_name      on service_providers (lower(name));  -- ordenação alfabética
create index idx_tenant_requests_property    on tenant_requests (property_id);
create index idx_tenant_requests_status      on tenant_requests (status);
create index idx_tenant_requests_archived    on tenant_requests (archived_at);
create index idx_tr_attachments_request      on tenant_request_attachments (tenant_request_id);
create index idx_services_property           on services (property_id);
create index idx_services_provider           on services (provider_id);
create index idx_services_request            on services (tenant_request_id);
create index idx_services_status             on services (status);
create index idx_service_attachments_service on service_attachments (service_id);
create index idx_listings_client             on listings (client_id);
create index idx_listings_archived           on listings (archived_at);
create index idx_listings_type               on listings (listing_type);
create index idx_notes_parent                on notes (parent_type, parent_id);
create index idx_notes_year                  on notes (year);
create index idx_documents_parent            on documents (parent_type, parent_id);
create index idx_documents_year              on documents (year);

-- updated_at triggers
create trigger trg_service_providers_updated before update on service_providers for each row execute function set_updated_at();
create trigger trg_tenant_requests_updated   before update on tenant_requests   for each row execute function set_updated_at();
create trigger trg_services_updated          before update on services          for each row execute function set_updated_at();
create trigger trg_listings_updated          before update on listings          for each row execute function set_updated_at();
create trigger trg_notes_updated             before update on notes             for each row execute function set_updated_at();
