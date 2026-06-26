-- =============================================================================
-- Capability `invoices.seasonal` — ver/criar invoices de TEMPORADA (Airbnb/VRBO)
-- sem exigir financials.full. Espelha invoices.service (que é só service). Assim
-- a secretária passa a ver/criar TODAS as invoices (service + seasonal), MAS
-- segue sem ver commissions / owner payouts / expenses (esses continuam só em
-- financials.full — a "financial da By the C" virá numa seção própria depois).
-- Manager já tinha tudo via financials.full; ganha o cap também por simetria.
-- =============================================================================

-- 1) has_cap(): adiciona 'invoices.seasonal' aos defaults de manager e secretary.
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
      'users.create','users.manage_access'
    );

  elsif p.role = 'secretary' then
    default_allowed := cap in (
      'clients.edit','properties.edit','operations.edit',
      'invoices.service','invoices.seasonal','payments.annual'
    );

  else
    default_allowed := false;
  end if;

  return default_allowed;
end;
$$;

-- 2) RLS invoices: seasonal liberado por invoices.seasonal (além de financials.full).
drop policy if exists invoices_select on invoices;
create policy invoices_select on invoices for select
  using (
    has_cap('financials.full')
    or (has_cap('invoices.service') and kind = 'service')
    or (has_cap('invoices.seasonal') and kind = 'seasonal')
  );

drop policy if exists invoices_insert on invoices;
create policy invoices_insert on invoices for insert
  with check (
    has_cap('financials.full')
    or (has_cap('invoices.service') and kind = 'service')
    or (has_cap('invoices.seasonal') and kind = 'seasonal')
  );

drop policy if exists invoices_update on invoices;
create policy invoices_update on invoices for update
  using (
    has_cap('financials.full')
    or (has_cap('invoices.service') and kind = 'service')
    or (has_cap('invoices.seasonal') and kind = 'seasonal')
  )
  with check (
    has_cap('financials.full')
    or (has_cap('invoices.service') and kind = 'service')
    or (has_cap('invoices.seasonal') and kind = 'seasonal')
  );

-- 3) RLS invoice_items: segue o kind da invoice-pai (service OU seasonal).
drop policy if exists invoice_items_select on invoice_items;
create policy invoice_items_select on invoice_items for select
  using (
    has_cap('financials.full')
    or (
      has_cap('invoices.service')
      and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'service')
    )
    or (
      has_cap('invoices.seasonal')
      and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'seasonal')
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
    or (
      has_cap('invoices.seasonal')
      and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'seasonal')
    )
  )
  with check (
    has_cap('financials.full')
    or (
      has_cap('invoices.service')
      and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'service')
    )
    or (
      has_cap('invoices.seasonal')
      and exists (select 1 from invoices i where i.id = invoice_id and i.kind = 'seasonal')
    )
  );
