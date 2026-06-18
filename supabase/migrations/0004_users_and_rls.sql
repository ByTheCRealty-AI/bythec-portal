-- =============================================================================
-- By the C — Migration 0004 · Usuários, papéis e RLS (esqueleto)
-- =============================================================================
-- Módulo 1: 2 admins (Andrea + Aline) poder total; Julia restrita; prestadores.
-- Acesso GRANULAR por aba/sub-área. Se não tem acesso, a aba não aparece.
--
-- NESTA RODADA: tabela app_users + estrutura de permissões em JSONB.
-- RLS COMPLETO fica como TODO documentado (decisão: implementar quando Auth
-- estiver plugado e o app rodar contra projeto real). Abaixo deixamos os
-- ganchos comentados mostrando ONDE entra cada policy.
-- =============================================================================

create type app_role as enum ('admin', 'staff', 'provider', 'owner', 'tenant');

-- app_users espelha auth.users (Supabase Auth). id = auth.users.id.
-- Em ambiente real: `references auth.users(id)`. Local sem Auth plugado, deixamos
-- como uuid livre p/ o seed funcionar; trocar p/ FK quando Auth entrar.
create table app_users (
  id            uuid primary key default gen_random_uuid(),
  -- references auth.users(id) on delete cascade,   -- TODO: ligar ao Supabase Auth
  email         text not null unique,
  full_name     text,
  role          app_role not null default 'staff',

  -- Permissões granulares por módulo/aba. Ex.:
  -- { "overview": true, "clientes": true, "propriedades": true,
  --   "invoices": false, "payments": true, "expenses": false,
  --   "requests": true, "providers": true, "listings": true }
  -- Julia, p.ex.: só payments=true, resto false → no app, aba não aparece.
  permissions   jsonb not null default '{}'::jsonb,

  archived_at   timestamptz,           -- remover ex-funcionário = arquivar
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table app_users is 'Usuários do painel. Admins (Andrea+Aline) full; staff (Julia) restrito via permissions JSONB. Aba não aparece se permissão=false.';
comment on column app_users.permissions is 'Permissão granular por aba. Front lê isto pra montar a sidebar. Ex.: Julia {payments:true}.';

create trigger trg_app_users_updated before update on app_users for each row execute function set_updated_at();
create index idx_app_users_role on app_users (role);

-- =============================================================================
-- RLS — TODO (não habilitado nesta rodada). Quando Supabase Auth estiver
-- plugado, habilitar e criar policies. Esqueleto do raciocínio:
-- =============================================================================
--
-- Helper p/ checar permissão de aba do usuário logado:
--   create or replace function has_tab(tab text) returns boolean
--   language sql stable as $$
--     select coalesce((
--       select (permissions ->> tab)::boolean or role = 'admin'
--       from app_users where id = auth.uid() and archived_at is null
--     ), false);
--   $$;
--
-- Exemplo (clients): admin vê tudo; staff só se has_tab('clientes'):
--   alter table clients enable row level security;
--   create policy clients_read  on clients for select
--     using ( has_tab('clientes') );
--   create policy clients_write on clients for all
--     using ( has_tab('clientes') ) with check ( has_tab('clientes') );
--
-- Portal do dono (Onda 2 / Fase 2): owner só vê as PRÓPRIAS propriedades/invoices:
--   create policy owner_props on properties for select
--     using ( owner_id = (select id from app_users where id = auth.uid()) );
--   (requer ligar app_users a clients — ponte client_id em app_users.)
--
-- Portal do inquilino: tenant só vê os próprios tenant_requests/payments.
-- Portal do prestador: provider só vê os próprios services.
--
-- Dado sensível (application SSN/DL — módulo 12, Onda 2/Fase 3): coluna
-- criptografada + policy de acesso restrito a admin. NÃO entra nesta rodada.
-- =============================================================================
