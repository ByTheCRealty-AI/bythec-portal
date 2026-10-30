-- =============================================================================
-- By the C — Migration 0055 · TEAM MEMBERS (Meet the Team) + public photo bucket
-- =============================================================================
-- Moves the website "Meet the Team" section into the database so it can be
-- managed from the portal (inside Users & Access): add/edit/reorder members,
-- upload headshots, and decide who is published. Editing is OWNER + MANAGER only.
-- Photos live in a dedicated PUBLIC `team-photos` bucket (images only), separate
-- from the private `documents` bucket. Seeds the current four members.
-- =============================================================================

-- 1) Table -------------------------------------------------------------------
create table if not exists team_members (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  title         text not null,
  bio           text,
  photo_url     text,                -- public URL (bucket is public); null = initials avatar
  storage_path  text,                -- path inside team-photos (for delete)
  initials      text,                -- fallback avatar when no photo
  sort_order    integer not null default 0,
  published     boolean not null default true,  -- false = hidden from the public site
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table team_members is 'Public "Meet the Team" members for the website, managed from the portal.';

alter table team_members enable row level security;

-- Public (anon) can read PUBLISHED members only; staff manage all.
drop policy if exists team_members_public_read on team_members;
create policy team_members_public_read on team_members
  for select
  to anon, authenticated
  using (published = true);

-- Owner + manager only (not secretary/realtor).
drop policy if exists team_members_write on team_members;
create policy team_members_write on team_members
  for all
  using (current_app_role() in ('owner', 'manager'))
  with check (current_app_role() in ('owner', 'manager'));

grant select on team_members to anon, authenticated;
grant insert, update, delete on team_members to authenticated;

create index if not exists idx_team_members_order on team_members (sort_order);

-- 2) Public bucket, images only ---------------------------------------------
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

-- 3) Seed the current four (only if the table is empty) ----------------------
insert into team_members (name, title, bio, initials, sort_order)
select v.name, v.title, v.bio, v.initials, v.sort_order
from (values
  ('Andrea DeSouza', 'Broker & Owner', 'Licensed Realtor since 2005 and a broker since 2016, when she founded By the C Realty. Holds the PSA, ABR, and COS designations.', 'AD', 0),
  ('Alyne Ramiro', 'Manager', 'As our manager, Alyne keeps By the C running day to day — coordinating listings, leases, maintenance, and owner communication so nothing slips through the cracks.', 'AR', 1),
  ('Julia Wolff', 'Secretary', 'Julia is often the first friendly voice you''ll reach at By the C. She handles scheduling, paperwork, and the day-to-day requests that keep clients and owners cared for.', 'JW', 2),
  ('Emily Lauria', 'Realtor', 'Emily works alongside Andrea to help buyers, sellers, and renters find the right fit on Cape Cod, guiding clients from the first showing to the closing table.', 'EL', 3)
) as v(name, title, bio, initials, sort_order)
where not exists (select 1 from team_members);
