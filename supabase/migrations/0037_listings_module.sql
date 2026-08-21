-- =============================================================================
-- By the C — Migration 0037 · LISTINGS MODULE (portal screen + permissions)
-- =============================================================================
-- Turns `listings` from an empty placeholder table into a real, operated module.
--
-- Andrea's rules for this module (approved 2026-08-21):
--   1) ANYONE on the team can create, edit and delete a listing — owner, manager,
--      secretary AND realtor. Listings are marketing rows, not financial or
--      client records, so they do not follow the stricter clients/properties rule.
--   2) A listing can be made INACTIVE so it stops showing on the public website
--      without being deleted (`active` column, already present since 0003).
--   3) A listing carries a clickable external link — Airbnb or CCIAOR/MLS —
--      so a visitor can open the real listing (`airbnb_link` / `mls_link`,
--      already present since 0003).
--   4) DELETE IS RECOVERABLE for everyone (sets archived_at). Only the OWNER can
--      permanently destroy a listing, and only after it is archived.
--
-- Shape of the change:
--   - new capability `listings.manage` (create/edit/archive/restore)
--   - has_cap() rebuilt with the FULL UNION of every capability (see the
--     has_cap warning below) plus listings.manage for the 4 internal-ish roles
--   - listings RLS re-cut so realtor can write (it only had operations.edit)
--   - admin_delete_listing() RPC — owner only, archive-first, cleans children
--   - category / sqft / slug columns so the portal form can drive which tab the
--     listing lands on when the public website goes live
--
-- ⚠️ has_cap() WARNING (lesson 2026-08-13): `create or replace function` swaps
-- the WHOLE function. Several migrations rewrite has_cap(); whichever has the
-- HIGHEST number and is applied LAST wins. This file is currently that file, so
-- the CASE below carries the complete union of every capability granted by
-- 0005 / 0021 / 0025 / 0029 / 0031 / 0032 / 0033_secretary. Source of truth for
-- the mirror is src/lib/auth/capabilities.ts — keep both in step.
-- =============================================================================

-- 1) Listing shaping columns --------------------------------------------------
-- These three also appear in 0033_public_listings.sql (website go-live). Both
-- files use `if not exists` / `create or replace`, so applying either first is
-- safe and applying both is a no-op the second time.

-- category: drives which tab the listing shows on for the public site.
alter table listings add column if not exists category property_type;
comment on column listings.category is
  'Website tab. for_sale=For Sale; year_round_rental=Long-Term; vacation_rental/off_season_rental=Vacation & Winter. Set from the portal listing form.';

alter table listings add column if not exists sqft integer;
comment on column listings.sqft is 'Interior square footage. Optional; shown on the public site.';

alter table listings add column if not exists slug text;
comment on column listings.slug is
  'Stable public URL slug (/listings/[slug]). Generated once by trigger and never recomputed — changing it would break links already indexed by Google.';

-- Slug is generated ONLY when absent, so editing an address never breaks a live URL.
create or replace function set_listing_slug() returns trigger as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := left(
      trim(both '-' from regexp_replace(lower(coalesce(new.address, 'listing')), '[^a-z0-9]+', '-', 'g'))
      || '-' || left(replace(new.id::text, '-', ''), 8),
      80
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_listing_slug on listings;
create trigger trg_listing_slug
  before insert or update on listings
  for each row execute function set_listing_slug();

update listings
   set slug = left(
     trim(both '-' from regexp_replace(lower(coalesce(address, 'listing')), '[^a-z0-9]+', '-', 'g'))
     || '-' || left(replace(id::text, '-', ''), 8),
     80
   )
 where slug is null;

create unique index if not exists idx_listings_slug on listings (slug);

-- Helpful for the portal list (active first, newest first).
create index if not exists idx_listings_active on listings (active);

-- 2) has_cap() — FULL UNION + listings.manage --------------------------------
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

  -- Per-user override always wins (grant OR revoke).
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
      'clients.own','properties.own','providers.view',
      'listings.view','listings.manage',
      'users.create','users.manage_access'
    );
  elsif p.role = 'secretary' then
    default_allowed := cap in (
      'clients.edit','properties.edit','operations.edit',
      'invoices.service','invoices.seasonal','invoices.general','payments.annual',
      'expenses.manage','applications.manage',
      'reminders.view','reminders.manage',
      'clients.own','properties.own','providers.view',
      'listings.view','listings.manage'
    );
  elsif p.role = 'realtor' then
    default_allowed := cap in (
      'reminders.view','reminders.manage',
      'clients.own','properties.own','providers.view',
      'listings.view','listings.manage',   -- NEW: realtor operates listings too
      'invoices.general'
    );
  else
    default_allowed := false;
  end if;

  return default_allowed;
end;
$function$;

-- 3) Listings RLS — realtor can now write ------------------------------------
-- Old policy `listings_rw` was ALL/operations.edit, which excluded realtor.
-- Re-cut into explicit SELECT / INSERT / UPDATE. No DELETE policy on purpose:
-- destroying a row goes exclusively through admin_delete_listing() (owner only).
drop policy if exists listings_rw on listings;
drop policy if exists listings_shared_read on listings;
drop policy if exists listings_select on listings;
drop policy if exists listings_insert on listings;
drop policy if exists listings_update on listings;

create policy listings_select on listings
  for select
  using (has_cap('listings.view') or has_cap('listings.manage') or has_cap('operations.edit'));

create policy listings_insert on listings
  for insert
  with check (has_cap('listings.manage') or has_cap('operations.edit'));

-- Covers edit, the active/featured toggles, archive (delete) and restore.
create policy listings_update on listings
  for update
  using (has_cap('listings.manage') or has_cap('operations.edit'))
  with check (has_cap('listings.manage') or has_cap('operations.edit'));

-- 4) admin_delete_listing — OWNER ONLY, archive-first -------------------------
-- Mirrors admin_delete_property/admin_delete_client: the database is the real
-- gate (the server action re-checks only as defense in depth), and it refuses
-- to destroy a listing that has not been archived first.
create or replace function public.admin_delete_listing(l_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_archived timestamptz;
begin
  if public.current_app_role() is distinct from 'owner' then
    raise exception 'Only the owner can permanently delete a listing.' using errcode = '42501';
  end if;

  select archived_at into v_archived from listings where id = l_id;
  if not found then
    raise exception 'Listing not found.' using errcode = 'P0002';
  end if;
  if v_archived is null then
    raise exception 'Delete the listing first, then it can be permanently removed.' using errcode = 'P0001';
  end if;

  delete from notes     where parent_type = 'listing' and parent_id = l_id;
  delete from documents where parent_type = 'listing' and parent_id = l_id;
  delete from listings  where id = l_id;
end;
$function$;

revoke all on function public.admin_delete_listing(uuid) from public, anon;
grant execute on function public.admin_delete_listing(uuid) to authenticated;
