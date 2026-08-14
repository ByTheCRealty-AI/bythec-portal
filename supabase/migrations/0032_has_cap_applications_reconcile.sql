-- =============================================================================
-- 0032 — has_cap() RECONCILIAÇÃO (autoridade final)
-- =============================================================================
-- Duas frentes paralelas recriaram has_cap() em migrations diferentes:
--   0029 (rental applications) adicionou 'applications.manage' ao manager.
--   0031 (general invoices)    adicionou 'invoices.general' a manager/secretary/
--                              realtor — MAS sem 'applications.manage'.
-- Como 0031 roda depois de 0029, sozinha ela REGREDIRIA o applications.manage do
-- manager. Esta migration roda por último e define has_cap() com a UNIÃO correta
-- das duas frentes, espelhando exatamente src/lib/auth/capabilities.ts.
-- (owner continua retornando true pra qualquer cap.)
-- =============================================================================

create or replace function public.has_cap(cap text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
      'financials.full','invoices.service','invoices.seasonal','invoices.general','payments.annual',
      'expenses.manage','applications.manage',
      'reminders.view','reminders.manage',
      'clients.own','properties.own','providers.view','listings.view',
      'users.create','users.manage_access'
    );

  elsif p.role = 'secretary' then
    default_allowed := cap in (
      'clients.edit','properties.edit','operations.edit',
      'invoices.service','invoices.seasonal','invoices.general','payments.annual',
      'expenses.manage',
      'reminders.view','reminders.manage',
      'clients.own','properties.own','providers.view','listings.view'
    );

  elsif p.role = 'realtor' then
    default_allowed := cap in (
      'reminders.view','reminders.manage',
      'clients.own','properties.own','providers.view','listings.view',
      'invoices.general'
    );

  else
    default_allowed := false;
  end if;

  return default_allowed;
end;
$function$;
