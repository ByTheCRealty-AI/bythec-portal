-- =============================================================================
-- By the C — Migration 0058 · "Meet the Team" ATTACHED TO THE EXISTING PEOPLE
-- =============================================================================
-- The public website "Meet the Team" section is driven by the people who ALREADY
-- exist in the portal (the profiles / Users & Access list) — NOT a separate list.
-- Each person gets a few public-facing fields (a professional photo, a public
-- title, a short bio, and a "show on the website" switch) edited right on their
-- own card in Users & Access. Editing stays OWNER + MANAGER only (that whole
-- screen already is).
--
-- The website (anon key) must NEVER see a profile's email, phone, address, role
-- or permissions. RLS is row-level, not column-level, so we do NOT open the
-- profiles table to anon. Instead we expose a dedicated VIEW (website_team) that
-- projects ONLY the safe public columns of published + active people. A normal
-- (definer) view returns exactly those columns and nothing else.
--
-- Photos live in a dedicated PUBLIC `team-photos` bucket (images only), separate
-- from the private `documents` bucket (invoices + application IDs = PII).
-- SAFE / ADDITIVE. Idempotent.
-- =============================================================================

-- 1) Public-facing fields on the existing person record --------------------
alter table profiles add column if not exists public_title     text;
alter table profiles add column if not exists public_bio       text;
alter table profiles add column if not exists public_photo_url  text;
alter table profiles add column if not exists public_photo_path text;
alter table profiles add column if not exists show_on_website   boolean not null default false;
alter table profiles add column if not exists public_sort_order integer;

comment on column profiles.public_title is
  'Title shown on the public website "Meet the Team" (e.g. "Broker & Owner"). Separate from the internal role.';
comment on column profiles.public_bio is
  'Short bio shown under the person on the public website. Null = no bio.';
comment on column profiles.public_photo_url is
  'Public URL of the professional headshot (team-photos bucket). Null = initials avatar on the site.';
comment on column profiles.public_photo_path is
  'Path inside the team-photos bucket (for replace/delete). Internal only.';
comment on column profiles.show_on_website is
  'When true (and the person is active), they appear in the public website "Meet the Team" section.';
comment on column profiles.public_sort_order is
  'Optional manual order on the public website. Lower first; null sorts after and then by name.';

-- 2) Safe public projection — the ONLY thing the website (anon) reads -------
-- A normal view runs with the view owner's privileges and returns ONLY these
-- columns, so email / phone / address / role / permissions are never exposed.
create or replace view website_team as
  select
    p.id,
    p.full_name        as name,
    p.public_title     as title,
    p.public_bio       as bio,
    p.public_photo_url as photo_url,
    p.public_sort_order as sort_order
  from profiles p
  where p.show_on_website = true
    and p.active = true
    and p.full_name is not null
    and p.full_name <> '';

comment on view website_team is
  'Public, safe projection of the team for the marketing website. Only published + active people, only name/title/bio/photo. Never exposes contact info, role or permissions.';

grant select on website_team to anon, authenticated;

-- 3) Public bucket for the headshots, images only --------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-photos',
  'team-photos',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists team_photos_public_read on storage.objects;
create policy team_photos_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'team-photos');

drop policy if exists team_photos_staff_write on storage.objects;
create policy team_photos_staff_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'team-photos' and current_app_role() in ('owner', 'manager'));

drop policy if exists team_photos_staff_delete on storage.objects;
create policy team_photos_staff_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'team-photos' and current_app_role() in ('owner', 'manager'));
