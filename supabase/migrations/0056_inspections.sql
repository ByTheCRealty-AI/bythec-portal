-- =============================================================================
-- By the C — Migration 0056 · PROPERTY INSPECTIONS (relatório de inspeção)
-- =============================================================================
-- Substitui o template Word + fotos coladas à mão. A Andrea faz a inspeção no
-- celular, dentro do portal: checklist por seção, Good / Needs attention / N/A
-- (NÃO yes/no — "leak under sink: yes" é um "sim" ruim), fotos/vídeos com
-- legenda obrigatória, e no fim o portal gera o PDF e anexa nos documentos da
-- propriedade.
--
-- Tabelas:
--   inspection_template_items  checklist padrão (editável por owner/manager;
--                              mudanças valem só pra inspeções NOVAS)
--   inspections                uma inspeção de uma propriedade (draft/finished)
--   inspection_items           cópia do checklist pra ESTA inspeção (+ itens extras)
--   inspection_media           fotos/vídeos (bucket PRIVADO `documents`,
--                              prefixo inspections/<inspection_id>/). item_id null
--                              = fotos gerais da inspeção.
--
-- RLS (mesmo gate dos documents da propriedade, 0005):
--   escrever: has_cap('properties.edit') OR has_cap('operations.edit')
--   ler:      os mesmos + has_cap('properties.own') limitado às propriedades que o
--             usuário enxerga (o EXISTS em properties passa pelo RLS de properties,
--             então o realtor só vê inspeções das casas dele) — read-only.
--   template: ler = quem lê inspeções; escrever = só owner/manager.
-- NÃO mexe em has_cap() (lição 2026-08-13: create or replace troca a função toda).
-- =============================================================================

-- 1) Checklist padrão -----------------------------------------------------------
create table if not exists inspection_template_items (
  id          uuid primary key default gen_random_uuid(),
  section     text not null,
  label       text not null,
  position    integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table inspection_template_items is
  'Checklist padrão da inspeção. Copiado pra inspection_items ao criar uma inspeção; editar aqui NÃO altera inspeções existentes.';

-- 2) Inspeções -----------------------------------------------------------------
create table if not exists inspections (
  id               uuid primary key default gen_random_uuid(),
  -- CASCADE: o hard delete de propriedade (owner-only) não pode travar por causa
  -- de inspeção. Os arquivos no storage ficam órfãos nesse caso raro.
  property_id      uuid not null references properties(id) on delete cascade,
  inspected_on     date not null default current_date,
  inspected_by     text default 'By the C Realty & Property Management',
  status           text not null default 'draft' check (status in ('draft', 'finished')),
  notes            text,
  recommendations  text,
  pdf_document_id  uuid references documents(id) on delete set null,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);
comment on table inspections is
  'Inspeção de propriedade feita no portal. draft = em andamento (autosave); finished = PDF gerado e anexado em documents.';

-- 3) Itens da inspeção -----------------------------------------------------------
create table if not exists inspection_items (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  uuid not null references inspections(id) on delete cascade,
  section        text not null,
  label          text not null,
  position       integer not null default 0,
  result         text check (result in ('good', 'attention', 'na')),
  note           text,
  -- Só faz sentido em itens 'attention': o dono aprovou o conserto?
  approval       text check (approval in ('pending', 'approved', 'declined')),
  -- Service criado (SÓ por clique, SÓ pra item aprovado). Nunca automático.
  service_id     uuid references services(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- 4) Fotos / vídeos ----------------------------------------------------------------
create table if not exists inspection_media (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  uuid not null references inspections(id) on delete cascade,
  item_id        uuid references inspection_items(id) on delete cascade, -- null = fotos gerais
  storage_path   text not null,                 -- object path no bucket privado `documents`
  kind           text not null default 'photo' check (kind in ('photo', 'video')),
  caption        text not null default '',      -- obrigatória pra finalizar (validado no app)
  position       integer not null default 0,
  created_at     timestamptz not null default now()
);

-- Índices ------------------------------------------------------------------------
create index if not exists idx_inspection_template_section on inspection_template_items (section, position);
create index if not exists idx_inspections_property        on inspections (property_id);
create index if not exists idx_inspections_pdf_document    on inspections (pdf_document_id);
create index if not exists idx_inspection_items_inspection on inspection_items (inspection_id);
create index if not exists idx_inspection_items_service    on inspection_items (service_id);
create index if not exists idx_inspection_media_inspection on inspection_media (inspection_id);
create index if not exists idx_inspection_media_item       on inspection_media (item_id);

-- 5) RLS -------------------------------------------------------------------------
alter table inspection_template_items enable row level security;
alter table inspections               enable row level security;
alter table inspection_items          enable row level security;
alter table inspection_media          enable row level security;

-- Template: leitura pra quem trabalha com propriedades; escrita só owner/manager.
drop policy if exists inspection_template_select on inspection_template_items;
create policy inspection_template_select on inspection_template_items for select
  using ( has_cap('properties.edit') or has_cap('operations.edit') or has_cap('properties.own') );

drop policy if exists inspection_template_write on inspection_template_items;
create policy inspection_template_write on inspection_template_items for all
  using ( current_app_role() in ('owner', 'manager') )
  with check ( current_app_role() in ('owner', 'manager') );

-- Inspections
drop policy if exists inspections_select on inspections;
create policy inspections_select on inspections for select
  using (
    has_cap('properties.edit') or has_cap('operations.edit')
    or (
      has_cap('properties.own')
      and exists (select 1 from properties p where p.id = inspections.property_id)
    )
  );

drop policy if exists inspections_write on inspections;
create policy inspections_write on inspections for all
  using ( has_cap('properties.edit') or has_cap('operations.edit') )
  with check ( has_cap('properties.edit') or has_cap('operations.edit') );

-- Itens: leitura segue a inspeção-mãe (o EXISTS passa pelo RLS de inspections).
drop policy if exists inspection_items_select on inspection_items;
create policy inspection_items_select on inspection_items for select
  using ( exists (select 1 from inspections i where i.id = inspection_items.inspection_id) );

drop policy if exists inspection_items_write on inspection_items;
create policy inspection_items_write on inspection_items for all
  using ( has_cap('properties.edit') or has_cap('operations.edit') )
  with check ( has_cap('properties.edit') or has_cap('operations.edit') );

-- Mídia
drop policy if exists inspection_media_select on inspection_media;
create policy inspection_media_select on inspection_media for select
  using ( exists (select 1 from inspections i where i.id = inspection_media.inspection_id) );

drop policy if exists inspection_media_write on inspection_media;
create policy inspection_media_write on inspection_media for all
  using ( has_cap('properties.edit') or has_cap('operations.edit') )
  with check ( has_cap('properties.edit') or has_cap('operations.edit') );

grant select, insert, update, delete on inspection_template_items to authenticated;
grant select, insert, update, delete on inspections               to authenticated;
grant select, insert, update, delete on inspection_items          to authenticated;
grant select, insert, update, delete on inspection_media          to authenticated;

-- 6) Seed: os 26 itens padrão (só se o checklist estiver vazio) --------------------
insert into inspection_template_items (section, label, position)
select v.section, v.label, v.position
from (values
  ('Kitchen', 'Stove', 10),
  ('Kitchen', 'Oven', 20),
  ('Kitchen', 'Range hood', 30),
  ('Kitchen', 'Microwave', 40),
  ('Kitchen', 'Dishwasher', 50),
  ('Kitchen', 'Refrigerator', 60),
  ('Kitchen', 'Under-sink plumbing', 70),
  ('Kitchen', 'Kitchen drains', 80),
  ('Bathrooms', 'Bathroom sink drains', 110),
  ('Bathrooms', 'Shower and tub drains', 120),
  ('Bathrooms', 'Toilet', 130),
  ('Bathrooms', 'Exhaust fans', 140),
  ('Bathrooms', 'Plumbing', 150),
  ('Bathrooms', 'Moisture and mold', 160),
  ('Safety items', 'Smoke detectors', 210),
  ('Safety items', 'Carbon monoxide detectors', 220),
  ('General interior', 'Windows', 310),
  ('General interior', 'Door locks', 320),
  ('General interior', 'Walls', 330),
  ('General interior', 'Ceilings', 340),
  ('General interior', 'Floors', 350),
  ('General interior', 'Odors', 360),
  ('Exterior', 'Exterior condition', 410),
  ('Exterior', 'Siding, roof and trim', 420),
  ('Exterior', 'Deck or patio', 430),
  ('Exterior', 'Landscaping', 440)
) as v(section, label, position)
where not exists (select 1 from inspection_template_items);
