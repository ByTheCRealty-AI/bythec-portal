-- 0033 · owner-approved 2026-08-14: secretary role gets applications.manage
-- (sees full application details incl. SSN). Specific users can be revoked via
-- per-user permissions override. Mind P (secretary) is revoked below.
-- has_cap = final union (mirrors src/lib/auth/capabilities.ts).
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
      'expenses.manage','applications.manage',
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

-- Revoke applications access for Mind P specifically (per-user override wins).
update public.profiles
   set permissions = coalesce(permissions, '{}'::jsonb) || '{"applications.manage": false}'::jsonb
 where id = '78212d49-44e5-4e3a-b6c3-787da224a0fa';
