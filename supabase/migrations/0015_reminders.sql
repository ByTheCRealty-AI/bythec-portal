-- =============================================================================
-- By the C — Migration 0015 · Reminders / Follow-ups (quadro compartilhado)
-- =============================================================================
-- Quadro compartilhado de lembretes. Qualquer interno cria um lembrete e designa
-- a uma pessoa (profiles). Escalação é COMPUTADA AO VIVO no app (sem cron, sem
-- timestamps de alerta) — ver src/lib/reminders.ts. Aqui só o dado + RLS + caps.
--
-- Novas capabilities:
--   reminders.view   — ver o board (owner, manager, secretary, realtor).
--   reminders.manage — criar/atribuir/completar/editar/arquivar (mesmos papéis).
-- ESPELHA src/lib/auth/capabilities.ts (has_cap recriada abaixo com as 2 caps).
--
-- TRAVADO: arquivar (archived_at), NUNCA deletar — só owner faz hard delete.
-- Aplicar via Supabase MCP (apply_migration). Idempotente onde dá.
-- =============================================================================

-- =============================================================================
-- 1) Tabela reminders
-- =============================================================================
create table if not exists reminders (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  notes        text,
  assigned_to  uuid not null references profiles(id) on delete restrict,
  created_by   uuid not null references profiles(id) on delete restrict,
  status       text not null default 'open' check (status in ('open','done')),
  done_at      timestamptz,
  due_date     date,
  parent_type  text check (parent_type in ('client','property','listing')),
  parent_id    uuid,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table reminders is 'Quadro compartilhado de lembretes/follow-ups. Escalação computada ao vivo no app (in-portal, sem email/cron). Arquivar, nunca deletar — só owner hard-delete.';
comment on column reminders.due_date is 'Opcional. Se setado, ancora o relógio de escalação (senão usa created_at).';

create index if not exists idx_reminders_assigned_to on reminders (assigned_to);
create index if not exists idx_reminders_status       on reminders (status);
create index if not exists idx_reminders_created_at    on reminders (created_at);

drop trigger if exists trg_reminders_updated on reminders;
create trigger trg_reminders_updated
  before update on reminders for each row execute function set_updated_at();

-- =============================================================================
-- 2) has_cap() — RECRIADA com reminders.view / reminders.manage.
--    Espelha ROLE_DEFAULT_CAPS de capabilities.ts:
--      owner:     todas (return true)
--      manager:   + reminders.view, reminders.manage
--      secretary: + reminders.view, reminders.manage
--      realtor:   SOMENTE reminders.view, reminders.manage (participa do board)
-- =============================================================================
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
      'financials.full','invoices.service','invoices.seasonal','payments.annual',
      'reminders.view','reminders.manage',
      'users.create','users.manage_access'
      -- NÃO inclui 'users.delete'
    );

  elsif p.role = 'secretary' then
    default_allowed := cap in (
      'clients.edit','properties.edit','operations.edit',
      'invoices.service','invoices.seasonal','payments.annual',
      'reminders.view','reminders.manage'
    );

  elsif p.role = 'realtor' then
    -- Externo, mas participa do quadro de lembretes (só isso).
    default_allowed := cap in ('reminders.view','reminders.manage');

  else
    -- outros externos (owner_client/tenant): sem capacidade interna.
    default_allowed := false;
  end if;

  return default_allowed;
end;
$$;

-- =============================================================================
-- 2b) reminder_people() — diretório mínimo (id, nome, papel) das pessoas ativas,
--     pra montar o dropdown de "designar a" e resolver nomes/papéis no board.
--     SECURITY DEFINER + gate has_cap('reminders.view'): expõe SÓ id/nome/papel
--     (não email/telefone/permissions), e só a quem pode ver o quadro. Isso evita
--     abrir o SELECT de profiles (que vazaria colunas sensíveis) e evita usar o
--     service_role numa rota de leitura.
-- =============================================================================
create or replace function reminder_people()
returns table (id uuid, full_name text, role app_role)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.role
  from public.profiles p
  where p.active = true
    and has_cap('reminders.view')
  order by p.full_name nulls last
$$;

grant execute on function reminder_people() to authenticated;

-- =============================================================================
-- 3) RLS — reminders
--    select  -> reminders.view
--    insert  -> reminders.manage
--    update  -> reminders.manage
--    delete  -> owner only (senão arquiva via update)
-- =============================================================================
alter table reminders enable row level security;

drop policy if exists reminders_select on reminders;
create policy reminders_select on reminders for select
  using ( has_cap('reminders.view') );

drop policy if exists reminders_insert on reminders;
create policy reminders_insert on reminders for insert
  with check ( has_cap('reminders.manage') );

drop policy if exists reminders_update on reminders;
create policy reminders_update on reminders for update
  using ( has_cap('reminders.manage') )
  with check ( has_cap('reminders.manage') );

drop policy if exists reminders_delete on reminders;
create policy reminders_delete on reminders for delete
  using ( current_app_role() = 'owner' );
