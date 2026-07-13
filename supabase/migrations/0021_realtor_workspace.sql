-- =============================================================================
-- By the C — Migration 0021 · Realtor workspace (scoped clients/properties + shared providers/listings)
-- =============================================================================
-- Realtor passa a ter um espaço próprio no portal:
--   - Clients + Properties: SÓ os que ELE cria (created_by = auth.uid()). NUNCA vê
--     os da Andrea/internos. Enforced no BANCO (RLS), não só na UI.
--   - Service providers + Listings: vê TODOS (compartilhado), mas SÓ LEITURA.
--   - Sales: deriva de clients/properties (logo, já fica scoped aos dele).
--   - Reminders: já scoped (0016). Overview: scoped via RLS automaticamente.
--   - NÃO recebe operations.edit/clients.edit/properties.edit → requests, services,
--     notes, documents, invoices, payments, financials ficam FECHADOS pro realtor
--     (sem vazamento). Por isso usamos caps NOVOS granulares em vez de reusar os cheios.
--
-- Caps novos: clients.own, properties.own (ver scoped) + providers.view, listings.view
-- (ver compartilhado). Internos (owner/manager/secretary) também recebem os 4 —
-- a sidebar re-gateia Providers/Listings nesses caps novos, então internos precisam
-- deles pra não perder o item. has_cap RECRIADA a partir da definição LIVE.
-- =============================================================================

-- 1) Proveniência: quem criou o registro (realtor scope). Null = interno/legado.
alter table clients    add column if not exists created_by uuid references profiles(id);
alter table properties add column if not exists created_by uuid references profiles(id);
create index if not exists idx_clients_created_by    on clients    (created_by);
create index if not exists idx_properties_created_by on properties (created_by);

-- 2) has_cap() RECRIADA (base = LIVE) + caps novos.
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

  ov := p.permissions;
  if ov ? cap then
    return coalesce((ov ->> cap)::boolean, false);
  end if;

  if p.role = 'owner' then
    return true;

  elsif p.role = 'manager' then
    default_allowed := cap in (
      'clients.edit','properties.edit','operations.edit',
      'financials.full','invoices.service','invoices.seasonal','payments.annual',
      'reminders.view','reminders.manage',
      'clients.own','properties.own','providers.view','listings.view',
      'users.create','users.manage_access'
    );

  elsif p.role = 'secretary' then
    default_allowed := cap in (
      'clients.edit','properties.edit','operations.edit',
      'invoices.service','invoices.seasonal','payments.annual',
      'reminders.view','reminders.manage',
      'clients.own','properties.own','providers.view','listings.view'
    );

  elsif p.role = 'realtor' then
    default_allowed := cap in (
      'reminders.view','reminders.manage',
      'clients.own','properties.own','providers.view','listings.view'
    );

  else
    default_allowed := false;
  end if;

  return default_allowed;
end;
$$;

-- 3) CLIENTS — internos (clients.edit) veem tudo; realtor (clients.own) só os seus.
drop policy if exists clients_rw on clients;
create policy clients_rw on clients for all
  using (
    has_cap('clients.edit')
    or (has_cap('clients.own') and created_by = auth.uid())
  )
  with check (
    has_cap('clients.edit')
    or (has_cap('clients.own') and created_by = auth.uid())
  );

-- 4) PROPERTIES — mesma regra.
drop policy if exists properties_rw on properties;
create policy properties_rw on properties for all
  using (
    has_cap('properties.edit')
    or (has_cap('properties.own') and created_by = auth.uid())
  )
  with check (
    has_cap('properties.edit')
    or (has_cap('properties.own') and created_by = auth.uid())
  );

-- 5) SERVICE PROVIDERS — internos leem/escrevem (operations.edit, policy existente);
--    realtor LÊ todos (providers.view), sem escrever.
drop policy if exists service_providers_shared_read on service_providers;
create policy service_providers_shared_read on service_providers for select
  using ( has_cap('providers.view') );

-- 6) LISTINGS — internos leem/escrevem; realtor LÊ todas.
drop policy if exists listings_shared_read on listings;
create policy listings_shared_read on listings for select
  using ( has_cap('listings.view') );
