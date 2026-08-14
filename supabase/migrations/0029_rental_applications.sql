-- =============================================================================
-- By the C — Migration 0029 · PUBLIC rental applications
-- =============================================================================
-- A public (no-login) rental application, submitted from the website. Fields
-- come from the bilingual paper form (EN/PT) at
-- wiki/raw/docs/2026-08-10-rental-application-EN-PT.pdf.
--
-- SEGURANÇA (o ponto crítico — esta é a ÚNICA tabela que recebe dado de gente
-- SEM login):
--  - RLS ligado. NENHUMA policy pra anon. O público NÃO lê nem escreve direto.
--    O INSERT do público entra SÓ pelo service-role (admin.ts) numa server action
--    que valida o pagamento Stripe ANTES de gravar. service_role BYPASSA o RLS.
--  - SSN/ITIN NUNCA em texto puro: gravado cifrado (AES-256-GCM, app-level em
--    lib/crypto-ssn.ts). Guardamos só `ssn_last4` pra exibir sem decifrar.
--  - Leitura/gestão interna = has_cap('applications.manage') (owner + manager).
--    A secretária NÃO vê por padrão (dado sensível: SSN + fee). Andrea concede
--    por usuário via override se quiser.
-- =============================================================================

-- Status da aplicação (option set). Não removemos valores (histórico).
create type application_status as enum (
  'new',        -- recém-submetida, ainda não olhada
  'reviewing',  -- em análise
  'approved',
  'denied',
  'withdrawn'   -- candidato desistiu / duplicada
);

-- =============================================================================
-- Flag na propriedade: só as marcadas aparecem no dropdown público do /apply.
-- Default false → nada do portfólio vaza sem a Andrea/manager escolher.
-- =============================================================================
alter table public.properties
  add column if not exists accepting_applications boolean not null default false;

comment on column public.properties.accepting_applications is
  'Se true, a propriedade aparece no dropdown do formulário público /apply. Default false (portfólio não vaza).';

-- =============================================================================
-- RENTAL_APPLICATIONS
-- =============================================================================
create table public.rental_applications (
  id                      uuid primary key default gen_random_uuid(),

  -- Idioma em que o candidato preencheu (EN-US / PT-BR).
  language                text not null default 'en' check (language in ('en','pt')),
  status                  application_status not null default 'new',

  -- Propriedade solicitada. property_id quando escolhida no dropdown;
  -- property_other = texto livre quando "não listada".
  property_id             uuid references public.properties(id) on delete set null,
  property_other          text,

  -- ---- Applicant Information / Informações do Candidato --------------------
  full_name               text not null,
  -- Texto (não date): o formulário coleta DOB como MM/DD/YY, igual ao papel.
  date_of_birth           text,
  -- SSN/ITIN CIFRADO (base64 de iv:tag:ciphertext, AES-256-GCM). Nunca texto puro.
  ssn_encrypted           text,
  ssn_last4               text,          -- só os 4 últimos, pra exibir sem decifrar
  -- SSN/ITIN pode faltar, MAS a pergunta é obrigatória. Sem SSN -> explicação.
  has_ssn                 boolean,
  ssn_none_explanation    text,
  phone                   text,
  -- Driver's license OU (quando não tem) um government ID (State ID / Passport).
  has_license             boolean,
  drivers_license         text,
  drivers_license_state   text,
  gov_id_type             text check (gov_id_type in ('state_id','passport')),
  gov_id_number           text,
  email                   text,

  -- ---- Other Occupants / Ocupantes ----------------------------------------
  occupants_count         integer,
  -- [{ name, dob, is_adult, phone }] — ocupante 18+ tem phone (≠ do candidato)
  -- + upload de ID (ver rental_application_attachments, category='occupant_id').
  occupants               jsonb not null default '[]'::jsonb,

  -- ---- Rental History / Histórico de Aluguel (atual + 2 anteriores) --------
  -- [{ kind:'current'|'previous', street, city_state_zip, duration,
  --    landlord_name, landlord_phone }]
  rental_history          jsonb not null default '[]'::jsonb,

  -- ---- Vehicles / Veículos -------------------------------------------------
  -- [{ make_model, year, color, plate, plate_state }]
  vehicles                jsonb not null default '[]'::jsonb,

  -- ---- Employment / Emprego ------------------------------------------------
  employer                text,
  employer_address        text,
  manager_name            text,
  manager_phone           text,
  job_title               text,
  monthly_income          numeric(12,2),
  length_of_employment    text,

  -- ---- References / Referências (2 pessoais) -------------------------------
  -- [{ name, phone }]
  personal_references     jsonb not null default '[]'::jsonb,

  -- ---- Additional Information / Informações Adicionais ---------------------
  evicted                 boolean,
  evicted_detail          text,
  felony                  boolean,
  felony_detail           text,
  bankruptcy              boolean,
  bankruptcy_detail       text,
  smokes                  boolean,
  has_pets                boolean,
  pets_detail             text,
  reason_for_moving       text,

  -- ---- Signature & Consent / Assinatura e Consentimento --------------------
  consent_agreed          boolean not null default false,   -- background/credit check auth
  signature_name          text,                              -- assinatura digitada (candidato)
  signature_date          date,
  signature_name_2        text,                              -- co-candidato (opcional)
  signature_date_2        date,
  consent_ip              text,                              -- IP no envio (trilha de auditoria)

  -- ---- $50 non-refundable application fee (Stripe) -------------------------
  fee_amount              numeric(12,2) not null default 100,
  payment_status          text not null default 'unpaid'
                            check (payment_status in ('unpaid','paid')),
  stripe_payment_intent_id text unique,       -- unique = 1 pagamento não vira 2 aplicações
  paid_at                 timestamptz,

  -- ---- Audit trail interno -------------------------------------------------
  reviewed_by             uuid references public.profiles(id) on delete set null,
  ssn_last_revealed_at    timestamptz,         -- quando alguém decifrou o SSN
  ssn_last_revealed_by    uuid references public.profiles(id) on delete set null,
  internal_notes          text,

  archived_at             timestamptz,          -- TRAVADO: nunca deletar, arquivar
  submitted_at            timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.rental_applications is
  'Aplicações de aluguel do público (SEM login). Insert só via service-role após validar pagamento Stripe. SSN cifrado. RLS = has_cap(applications.manage).';
comment on column public.rental_applications.ssn_encrypted is
  'SSN/ITIN cifrado AES-256-GCM (lib/crypto-ssn.ts). NUNCA texto puro. Decifra só server-side, gated por applications.manage.';
comment on column public.rental_applications.stripe_payment_intent_id is
  'PaymentIntent do Stripe ($50). UNIQUE: um pagamento não pode gerar duas aplicações.';

create index idx_rental_apps_status     on public.rental_applications (status);
create index idx_rental_apps_submitted  on public.rental_applications (submitted_at desc);
create index idx_rental_apps_property   on public.rental_applications (property_id);
create index idx_rental_apps_archived   on public.rental_applications (archived_at);

create trigger trg_rental_apps_updated
  before update on public.rental_applications
  for each row execute function set_updated_at();

-- =============================================================================
-- RLS — internal only. SEM policy pra anon. O público entra só via service_role.
-- =============================================================================
alter table public.rental_applications enable row level security;

create policy rental_apps_manage on public.rental_applications for all
  using (has_cap('applications.manage'))
  with check (has_cap('applications.manage'));

-- =============================================================================
-- ATTACHMENTS — fotos/arquivos de government ID (candidato + ocupantes 18+).
-- =============================================================================
-- Uploads PÚBLICOS via signed upload URL (mintada pelo service-role). Os bytes
-- vão pro bucket privado `documents` (prefixo rental-applications/). Aqui só
-- guardamos a referência. Insert na submissão via service-role. Leitura interna
-- por signed URL, gated por applications.manage.
create table public.rental_application_attachments (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.rental_applications(id) on delete cascade,
  category        text not null check (category in ('applicant_id','occupant_id')),
  occupant_index  integer,        -- qual ocupante (quando category='occupant_id')
  label           text,           -- ex.: nome do ocupante, pra exibir
  file_path       text not null,  -- caminho no bucket `documents`
  file_name       text,
  content_type    text,
  created_at      timestamptz not null default now()
);

create index idx_rental_app_att_app on public.rental_application_attachments (application_id);

alter table public.rental_application_attachments enable row level security;

-- Só interno lê/gerencia. Público NÃO acessa (insert entra via service_role).
create policy rental_app_att_manage on public.rental_application_attachments for all
  using (has_cap('applications.manage'))
  with check (has_cap('applications.manage'));

-- =============================================================================
-- has_cap() — recria a def LIVE adicionando 'applications.manage' ao manager.
-- Owner já retorna true pra qualquer cap. Secretária NÃO recebe applications por
-- padrão (dado sensível). Inclui 'invoices.general' (cap paralelo já no front)
-- pra não regredir a função. Mantém o resto idêntico.
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
