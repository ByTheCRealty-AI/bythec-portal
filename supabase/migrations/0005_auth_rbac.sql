-- =============================================================================
-- By the C — Migration 0005 · Auth + RBAC (login real + RLS por capacidade)
-- =============================================================================
-- Substitui o esqueleto de 0004 (app_users/app_role antigo, sem dados reais).
-- Entrega: tabela profiles ligada a auth.users, enum app_role, trigger de
-- criação de profile, helpers SECURITY DEFINER (current_app_role, has_cap) e
-- RLS completo nas tabelas existentes — enforce por capacidade.
--
-- ESPELHA src/lib/auth/capabilities.ts (manter os dois em sincronia).
-- IMPORTANTE: aplicar via Supabase MCP (o Victor não tem acesso ao banco).
-- Idempotente onde dá (drop if exists) pra reaplicar com segurança.
-- =============================================================================

-- 0) Limpar o esqueleto antigo de 0004 (sem dados reais; era TODO documentado).
drop table if exists app_users cascade;
drop type  if exists app_role  cascade;  -- enum antigo (admin/staff/provider/owner/tenant)

-- =============================================================================
-- 1) Enum de papéis (novo) — 3 internos em uso + 3 externos reservados.
-- =============================================================================
create type app_role as enum (
  'owner',        -- super admin (Andrea)
  'manager',      -- gestão quase total (sem deletar usuários)
  'secretary',    -- operação sem finanças nem gestão de usuários
  'owner_client', -- portal do dono (reservado)
  'tenant',       -- portal do inquilino (reservado)
  'realtor'       -- portal do corretor (reservado)
);

-- =============================================================================
-- 2) profiles — 1:1 com auth.users. role + permissions (overrides) + active.
-- =============================================================================
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  email        text,
  phone        text,          -- contato pessoal do funcionário (opcional)
  address      text,          -- endereço pessoal do funcionário (opcional)
  role         app_role not null default 'secretary',
  -- Overrides por usuário sobre os defaults do papel:
  --   { "financials.full": true }  concede
  --   { "invoices.service": false } revoga
  permissions  jsonb not null default '{}'::jsonb,
  active        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table  profiles is 'Perfil 1:1 com auth.users. role + permissions(overrides JSONB) + active. Espelha capabilities.ts.';
comment on column profiles.permissions is 'Override por usuário. {"cap": true} concede, {"cap": false} revoga. Sem chave = segue o papel.';

create index idx_profiles_role on profiles (role);

create trigger trg_profiles_updated
  before update on profiles for each row execute function set_updated_at();

-- =============================================================================
-- 3) Trigger: ao criar auth.users, cria o profile (papel vem do metadata do
--    convite, senão 'secretary'). full_name/email/phone/address também do metadata.
-- =============================================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_role text;
  resolved_role app_role;
begin
  meta_role := nullif(new.raw_user_meta_data ->> 'role', '');
  begin
    resolved_role := coalesce(meta_role::app_role, 'secretary');
  exception when others then
    resolved_role := 'secretary';
  end;

  insert into public.profiles (id, full_name, email, phone, address, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'address', ''),
    resolved_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =============================================================================
-- 4) Helpers SECURITY DEFINER pra RLS.
--    current_app_role(): papel do usuário logado (NULL se não tem profile ativo).
--    has_cap(text): capacidade efetiva = default do papel ⊕ override do profile.
-- =============================================================================

create or replace function current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid() and active = true
$$;

-- Espelha ROLE_DEFAULT_CAPS + overrides de capabilities.ts.
create or replace function has_cap(cap text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p record;
  ov jsonb;
  default_allowed boolean := false;
begin
  select role, permissions, active into p
  from public.profiles
  where id = auth.uid();

  if p is null or p.active is not true then
    return false;
  end if;

  -- 1) Override explícito do usuário tem prioridade.
  ov := p.permissions;
  if ov ? cap then
    return coalesce((ov ->> cap)::boolean, false);
  end if;

  -- 2) Defaults por papel (ESPELHA ROLE_DEFAULT_CAPS).
  if p.role = 'owner' then
    -- super admin: todas as capacidades.
    return true;

  elsif p.role = 'manager' then
    default_allowed := cap in (
      'clients.edit','properties.edit','operations.edit',
      'financials.full','invoices.service','payments.annual',
      'users.create','users.manage_access'
      -- NÃO inclui 'users.delete'
    );

  elsif p.role = 'secretary' then
    default_allowed := cap in (
      'clients.edit','properties.edit','operations.edit',
      'invoices.service','payments.annual'
    );

  else
    -- externos (owner_client/tenant/realtor): sem capacidade interna.
    default_allowed := false;
  end if;

  return default_allowed;
end;
$$;

-- Pode o usuário logado gerir (editar) o profile de papel target_role?
--  - owner edita qualquer um.
--  - manager (users.manage_access) edita só quem NÃO é owner nem manager.
create or replace function can_manage_role(target_role app_role)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r app_role := current_app_role();
begin
  if r is null then
    return false;
  end if;
  if r = 'owner' then
    return true;
  end if;
  -- precisa do cap de gestão de acesso e o alvo não pode ser owner/manager
  if not has_cap('users.manage_access') then
    return false;
  end if;
  return target_role <> 'owner' and target_role <> 'manager';
end;
$$;

-- =============================================================================
-- 5) RLS — PROFILES
-- =============================================================================
alter table profiles enable row level security;

-- SELECT: vê o próprio profile + (se gere acesso) os que pode gerir.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (
    id = auth.uid()
    or (has_cap('users.manage_access') and can_manage_role(role))
  );

-- INSERT: só owner/manager (na prática o profile nasce pelo trigger; esta policy
-- cobre inserts manuais via sessão autenticada). O trigger roda como definer.
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert
  with check ( has_cap('users.create') and can_manage_role(role) );

-- UPDATE: quem tem manage_access E pode gerir o papel ATUAL e o NOVO papel.
-- (with check garante que não se promove alvo a owner/manager sem ser owner.)
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update
  using ( has_cap('users.manage_access') and can_manage_role(role) )
  with check ( has_cap('users.manage_access') and can_manage_role(role) );

-- DELETE: owner only. (Na prática a remoção é via auth.admin.deleteUser →
-- cascade no profile. Esta policy fecha a porta pra delete direto.)
drop policy if exists profiles_delete on profiles;
create policy profiles_delete on profiles for delete
  using ( current_app_role() = 'owner' );

-- =============================================================================
-- 6) RLS — tabelas OPERACIONAIS (não-financeiras).
--    Interno com a capacidade certa lê/escreve. Externos não entram.
--    Helper inline: internal = owner/manager/secretary (via has_cap das caps).
-- =============================================================================

-- clients -> clients.edit
alter table clients enable row level security;
drop policy if exists clients_rw on clients;
create policy clients_rw on clients for all
  using ( has_cap('clients.edit') )
  with check ( has_cap('clients.edit') );

-- properties -> properties.edit
alter table properties enable row level security;
drop policy if exists properties_rw on properties;
create policy properties_rw on properties for all
  using ( has_cap('properties.edit') )
  with check ( has_cap('properties.edit') );

-- client_roles -> segue clients.edit
alter table client_roles enable row level security;
drop policy if exists client_roles_rw on client_roles;
create policy client_roles_rw on client_roles for all
  using ( has_cap('clients.edit') )
  with check ( has_cap('clients.edit') );

-- operations: requests / providers / services / listings / notes / documents
alter table tenant_requests enable row level security;
drop policy if exists tenant_requests_rw on tenant_requests;
create policy tenant_requests_rw on tenant_requests for all
  using ( has_cap('operations.edit') )
  with check ( has_cap('operations.edit') );

alter table tenant_request_attachments enable row level security;
drop policy if exists tr_attach_rw on tenant_request_attachments;
create policy tr_attach_rw on tenant_request_attachments for all
  using ( has_cap('operations.edit') )
  with check ( has_cap('operations.edit') );

alter table service_providers enable row level security;
drop policy if exists service_providers_rw on service_providers;
create policy service_providers_rw on service_providers for all
  using ( has_cap('operations.edit') )
  with check ( has_cap('operations.edit') );

alter table services enable row level security;
drop policy if exists services_rw on services;
create policy services_rw on services for all
  using ( has_cap('operations.edit') )
  with check ( has_cap('operations.edit') );

alter table service_attachments enable row level security;
drop policy if exists service_attachments_rw on service_attachments;
create policy service_attachments_rw on service_attachments for all
  using ( has_cap('operations.edit') )
  with check ( has_cap('operations.edit') );

alter table listings enable row level security;
drop policy if exists listings_rw on listings;
create policy listings_rw on listings for all
  using ( has_cap('operations.edit') )
  with check ( has_cap('operations.edit') );

alter table notes enable row level security;
drop policy if exists notes_rw on notes;
create policy notes_rw on notes for all
  using ( has_cap('operations.edit') or has_cap('clients.edit') or has_cap('properties.edit') )
  with check ( has_cap('operations.edit') or has_cap('clients.edit') or has_cap('properties.edit') );

alter table documents enable row level security;
drop policy if exists documents_rw on documents;
create policy documents_rw on documents for all
  using ( has_cap('operations.edit') or has_cap('clients.edit') or has_cap('properties.edit') )
  with check ( has_cap('operations.edit') or has_cap('clients.edit') or has_cap('properties.edit') );

-- =============================================================================
-- 7) RLS — tabelas FINANCEIRAS.
--    Base: financials.full vê/edita tudo.
--    Exceções de escopo (coluna existente):
--      - invoices: has_cap('invoices.service') pode SELECT/INSERT/UPDATE
--        APENAS linhas com kind = 'service'.
--      - payments: has_cap('payments.annual') gere os pagamentos de aluguel
--        year-round (a tabela payments é JUSTAMENTE o aluguel recorrente).
--    invoice_items / expenses: sem coluna de "tipo de serviço" pra escopar de
--    forma segura → ficam restritas a financials.full (ver NOTA no relatório).
-- =============================================================================

-- INVOICES ---------------------------------------------------------------------
alter table invoices enable row level security;

drop policy if exists invoices_select on invoices;
create policy invoices_select on invoices for select
  using (
    has_cap('financials.full')
    or (has_cap('invoices.service') and kind = 'service')
  );

drop policy if exists invoices_insert on invoices;
create policy invoices_insert on invoices for insert
  with check (
    has_cap('financials.full')
    or (has_cap('invoices.service') and kind = 'service')
  );

drop policy if exists invoices_update on invoices;
create policy invoices_update on invoices for update
  using (
    has_cap('financials.full')
    or (has_cap('invoices.service') and kind = 'service')
  )
  with check (
    has_cap('financials.full')
    or (has_cap('invoices.service') and kind = 'service')
  );

-- DELETE de invoice NUNCA (regra: arquivar). Sem policy de delete = ninguém deleta.

-- INVOICE_ITEMS ----------------------------------------------------------------
-- Escopo seguro: itens de uma invoice de serviço seguem invoices.service via
-- subselect no invoice pai; senão exige financials.full.
alter table invoice_items enable row level security;

drop policy if exists invoice_items_select on invoice_items;
create policy invoice_items_select on invoice_items for select
  using (
    has_cap('financials.full')
    or (
      has_cap('invoices.service')
      and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'service')
    )
  );

drop policy if exists invoice_items_write on invoice_items;
create policy invoice_items_write on invoice_items for all
  using (
    has_cap('financials.full')
    or (
      has_cap('invoices.service')
      and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'service')
    )
  )
  with check (
    has_cap('financials.full')
    or (
      has_cap('invoices.service')
      and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'service')
    )
  );

-- PAYMENTS (aluguel year-round, regime de caixa) -------------------------------
alter table payments enable row level security;
drop policy if exists payments_rw on payments;
create policy payments_rw on payments for all
  using ( has_cap('financials.full') or has_cap('payments.annual') )
  with check ( has_cap('financials.full') or has_cap('payments.annual') );

alter table payment_attachments enable row level security;
drop policy if exists payment_attachments_rw on payment_attachments;
create policy payment_attachments_rw on payment_attachments for all
  using (
    has_cap('financials.full')
    or (
      has_cap('payments.annual')
      and exists (select 1 from payments p where p.id = payment_id)
    )
  )
  with check (
    has_cap('financials.full')
    or (
      has_cap('payments.annual')
      and exists (select 1 from payments p where p.id = payment_id)
    )
  );

-- EXPENSES (sem escopo parcial seguro) -> só financials.full --------------------
alter table expenses enable row level security;
drop policy if exists expenses_rw on expenses;
create policy expenses_rw on expenses for all
  using ( has_cap('financials.full') )
  with check ( has_cap('financials.full') );

-- =============================================================================
-- 8) NOTA: commissions e owner_payouts AINDA NÃO EXISTEM como tabelas.
--    Quando os módulos forem construídos, adicionar:
--      alter table commissions  enable row level security;
--      create policy commissions_rw  on commissions  for all
--        using (has_cap('financials.full')) with check (has_cap('financials.full'));
--      alter table owner_payouts enable row level security;
--      create policy owner_payouts_rw on owner_payouts for all
--        using (has_cap('financials.full')) with check (has_cap('financials.full'));
--    (Comissão year-round também pode derivar de payments via payments.annual.)
-- =============================================================================
