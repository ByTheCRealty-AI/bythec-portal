-- =============================================================================
-- By the C — Sistema próprio (Onda 2) · Migration 0001
-- Enums (option sets) + entidades núcleo: clients, properties
-- =============================================================================
-- Fonte de verdade: raw/base-conhecimento/blueprint-sistema-bubble.md
--                   raw/base-conhecimento/requisitos-sistema-novo.md
--
-- REGRAS TRAVADAS refletidas aqui:
--  - Cliente = entidade-mãe. properties.owner_id -> clients.id NOT NULL.
--  - NUNCA deletar: toda tabela de dado real tem archived_at (null = ativo).
--  - Endereço vem da base, com unit number (address2) — NUNCA do Google.
-- =============================================================================

-- Extensões -------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- =============================================================================
-- OPTION SETS (enums) — substituem os "OS *" do Bubble.
-- Decisão: usar ENUM nativo do Postgres (rápido, tipado). Para adicionar valor
-- futuro: `alter type ... add value`. Não removemos valores (histórico).
-- =============================================================================

-- OS Client Type. "Airbnb Guest" foi descartado (não se usa).
create type client_type as enum (
  'tenant',           -- inquilino year-round / long term
  'airbnb_owner',     -- dono de temporada (Airbnb/VRBO)
  'landlord',         -- dono long/short term
  'buy_sell_client',  -- comprador OU vendedor (papel detalhado em clients.deal_side)
  'off_season_tenant' -- inquilino de inverno / off-season
);

-- OS Listing Type / Property Type (filtro, não tela separada).
create type property_type as enum (
  'year_round_rental',
  'vacation_rental',   -- Airbnb (sem datas de lease)
  'off_season_rental',
  'for_sale'
);

-- OS Listing Status (usado por listings — migration 0003).
create type listing_status as enum (
  'active',
  'pending',
  'sold',
  'rented',
  'off_market'
);

-- OS Paid By (usado por expenses).
create type paid_by as enum (
  'bythec',
  'owner',
  'tenant',
  'other'
);

-- Lado do negócio para buy_sell_client (corrige "separar comprador de vendedor").
create type deal_side as enum (
  'buyer',
  'seller',
  'both'
);

-- =============================================================================
-- CLIENTS — entidade-mãe. 83 registros reais no Bubble.
-- =============================================================================
create table clients (
  id                  uuid primary key default gen_random_uuid(),

  name                text not null,
  -- client_type = papel PRINCIPAL. Um cliente pode ter MAIS de um papel:
  -- papéis adicionais vivem em client_roles (abaixo). client_type é o default
  -- de exibição/filtro; os outros papéis não se perdem. TRAVADO: trocar tipo
  -- nunca apaga histórico (é só reclassificação).
  client_type         client_type not null,
  deal_side           deal_side,            -- só relevante p/ buy_sell_client

  email               text,
  phone               text,
  photo_url           text,                 -- Storage: bucket "client-photos"
  notes               text,

  -- Endereço de cobrança. address2 = unidade/apto (renomeado de "Address 2").
  billing_address     text,
  billing_address2    text,

  -- Co-cliente (cônjuge/sócio no nome — não é login separado).
  co_client_name      text,
  co_client_email     text,
  co_client_phone     text,

  -- Preferências de notificação.
  email_notifications boolean not null default true,
  sms_notifications   boolean not null default false,

  -- "Active" do Bubble. Mantido por compat de migração; o estado canônico de
  -- "está na lista?" é archived_at IS NULL. active = sinalização de negócio.
  active              boolean not null default true,

  -- NUNCA deletar — arquivar. null = ativo.
  archived_at         timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column clients.client_type is 'TRAVADO: papel principal. Papéis extras em client_roles; trocar tipo não apaga histórico.';
comment on column clients.archived_at is 'TRAVADO: NUNCA deletar — arquivar. null = ativo. Listas filtram archived_at IS NULL.';
comment on column clients.billing_address2 is 'Unidade/apto. Endereço vem da base, com unit number — NUNCA do Google.';

-- Papéis múltiplos de um cliente (landlord E tenant, p.ex.) sem perder histórico.
create table client_roles (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete restrict,
  role        client_type not null,
  created_at  timestamptz not null default now(),
  unique (client_id, role)
);
comment on table client_roles is 'Papéis adicionais de um cliente (um cliente pode ser landlord E tenant). client_type segue sendo o principal.';

-- =============================================================================
-- PROPERTIES — imóveis sob gestão. 53 registros reais. Pendura no cliente.
-- =============================================================================
create table properties (
  id              uuid primary key default gen_random_uuid(),

  -- TRAVADO: toda propriedade tem um Owner (= Cliente). Cliente = entidade-mãe.
  -- on delete restrict reforça "nunca deletar cliente que tem propriedade".
  owner_id        uuid not null references clients(id) on delete restrict,

  -- Endereço da BASE (não do Google). address2 = unidade. address_text = busca.
  address         text not null,
  address2        text,
  address_text    text,                     -- normalizado p/ busca/match eCheck

  property_type   property_type not null,
  commission_fee  numeric(12,2),            -- taxa de comissão da propriedade (% por casa — incógnita p/ seasonal)

  -- Inquilino atual (opcional; só faz sentido p/ rentals). Aponta p/ um cliente.
  tenant_id       uuid references clients(id) on delete set null,

  -- Aluguel (year-round / off-season). Vacation rental NÃO tem datas de lease.
  rent_price      numeric(12,2),
  rental_start    date,
  rental_end      date,
  rent_due_day    integer default 1,        -- dia do mês (cheque dia 5, p.ex.)
  rent_frequency  text,                     -- 'monthly', 'quarterly', 'annual'...

  notes           text,
  photo_url       text,                     -- Storage: bucket "property-photos"

  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column properties.owner_id is 'TRAVADO: cliente = entidade-mãe. NOT NULL + restrict. Toda propriedade tem um owner.';
comment on column properties.address2 is 'Unidade/apto. Endereço da base com unit number — NUNCA do Google (bug do complex de 7 units).';
comment on column properties.commission_fee is 'Comissão por propriedade. Para seasonal a % é INCÓGNITA (confirmar com Andrea — bythec-mcp não chuta).';
comment on column properties.archived_at is 'TRAVADO: NUNCA deletar — arquivar. Mudar property_type carrega histórico junto.';

-- Índices óbvios -------------------------------------------------------------
create index idx_clients_archived          on clients (archived_at);
create index idx_clients_type              on clients (client_type);
create index idx_client_roles_client       on client_roles (client_id);
create index idx_properties_owner          on properties (owner_id);
create index idx_properties_tenant         on properties (tenant_id);
create index idx_properties_archived       on properties (archived_at);
create index idx_properties_type           on properties (property_type);

-- =============================================================================
-- updated_at automático (trigger genérico, reusado por todas as tabelas).
-- =============================================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_clients_updated    before update on clients    for each row execute function set_updated_at();
create trigger trg_properties_updated before update on properties for each row execute function set_updated_at();
