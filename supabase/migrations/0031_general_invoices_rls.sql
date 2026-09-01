-- =============================================================================
-- 0031_general_invoices_rls.sql
-- General invoices: total column + has_cap() grant + RLS (mirrors capabilities.ts).
-- General = simple one-off charge (description + amount → total). No worker cost,
-- no commission. Owner-facing total stored in invoices.general_total.
-- Access: owner/manager/secretary (all invoices) + realtor (general only) via the
-- new `invoices.general` capability. Runs AFTER 0030 (enum value committed).
-- =============================================================================

alter table invoices add column if not exists general_total numeric;
comment on column invoices.general_total is 'GENERAL: owner-facing total (sum of line-item amounts). No commission/worker cost.';

-- has_cap(): add invoices.general to manager, secretary, realtor (owner = all).
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
  select role, permissions, active into p from public.profiles where id = auth.uid();
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
      'expenses.manage',
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

-- invoices policies + general clause.
drop policy invoices_select on invoices;
create policy invoices_select on invoices for select using (
  has_cap('financials.full')
  or (has_cap('invoices.service') and kind = 'service'::invoice_kind)
  or (has_cap('invoices.seasonal') and kind = 'seasonal'::invoice_kind)
  or (has_cap('invoices.general') and kind = 'general'::invoice_kind)
);

drop policy invoices_insert on invoices;
create policy invoices_insert on invoices for insert with check (
  has_cap('financials.full')
  or (has_cap('invoices.service') and kind = 'service'::invoice_kind)
  or (has_cap('invoices.seasonal') and kind = 'seasonal'::invoice_kind)
  or (has_cap('invoices.general') and kind = 'general'::invoice_kind)
);

drop policy invoices_update on invoices;
create policy invoices_update on invoices for update using (
  has_cap('financials.full')
  or (has_cap('invoices.service') and kind = 'service'::invoice_kind)
  or (has_cap('invoices.seasonal') and kind = 'seasonal'::invoice_kind)
  or (has_cap('invoices.general') and kind = 'general'::invoice_kind)
) with check (
  has_cap('financials.full')
  or (has_cap('invoices.service') and kind = 'service'::invoice_kind)
  or (has_cap('invoices.seasonal') and kind = 'seasonal'::invoice_kind)
  or (has_cap('invoices.general') and kind = 'general'::invoice_kind)
);

-- invoice_items policies (kind resolved via parent invoice) + general clause.
drop policy invoice_items_select on invoice_items;
create policy invoice_items_select on invoice_items for select using (
  has_cap('financials.full')
  or (has_cap('invoices.service') and exists (select 1 from invoices i where i.id = invoice_items.invoice_id and i.kind = 'service'::invoice_kind))
  or (has_cap('invoices.seasonal') and exists (select 1 from invoices i where i.id = invoice_items.invoice_id and i.kind = 'seasonal'::invoice_kind))
  or (has_cap('invoices.general') and exists (select 1 from invoices i where i.id = invoice_items.invoice_id and i.kind = 'general'::invoice_kind))
);

drop policy invoice_items_write on invoice_items;
create policy invoice_items_write on invoice_items for all using (
  has_cap('financials.full')
  or (has_cap('invoices.service') and exists (select 1 from invoices i where i.id = invoice_items.invoice_id and i.kind = 'service'::invoice_kind))
  or (has_cap('invoices.seasonal') and exists (select 1 from invoices i where i.id = invoice_items.invoice_id and i.kind = 'seasonal'::invoice_kind))
  or (has_cap('invoices.general') and exists (select 1 from invoices i where i.id = invoice_items.invoice_id and i.kind = 'general'::invoice_kind))
) with check (
  has_cap('financials.full')
  or (has_cap('invoices.service') and exists (select 1 from invoices i where i.id = invoice_items.invoice_id and i.kind = 'service'::invoice_kind))
  or (has_cap('invoices.seasonal') and exists (select 1 from invoices i where i.id = invoice_items.invoice_id and i.kind = 'seasonal'::invoice_kind))
  or (has_cap('invoices.general') and exists (select 1 from invoices i where i.id = invoice_items.invoice_id and i.kind = 'general'::invoice_kind))
);
