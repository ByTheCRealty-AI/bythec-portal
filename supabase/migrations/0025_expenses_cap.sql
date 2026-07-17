-- 0025: Expenses module — new cap `expenses.manage` (owner + manager + SECRETARY).
-- A secretária pode ver/gerenciar Expenses, mas NÃO os Finances (financials.full
-- segue owner+manager). Recria has_cap() (def LIVE) adicionando 'expenses.manage'
-- a manager + secretary (owner já retorna true pra qualquer cap). Reaponta a RLS
-- de expenses de financials.full -> expenses.manage (cobre os 3 papéis).

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
      'financials.full','invoices.service','invoices.seasonal','payments.annual',
      'expenses.manage',
      'reminders.view','reminders.manage',
      'clients.own','properties.own','providers.view','listings.view',
      'users.create','users.manage_access'
    );

  elsif p.role = 'secretary' then
    default_allowed := cap in (
      'clients.edit','properties.edit','operations.edit',
      'invoices.service','invoices.seasonal','payments.annual',
      'expenses.manage',
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
$function$;

drop policy if exists expenses_rw on public.expenses;
create policy expenses_rw on public.expenses for all
  using (has_cap('expenses.manage'))
  with check (has_cap('expenses.manage'));
