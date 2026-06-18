-- =============================================================================
-- By the C — Migration 0002 · Finanças
-- invoices, invoice_items, payments + anexos, expenses
-- =============================================================================
-- REGRAS TRAVADAS refletidas (origem: requisitos módulos 6,6b,6c,7,8 +
-- .claude/mcp/bythec-mcp/server.js):
--  - invoice_number: sequencial e único, NUNCA pular/reusar (sequence dedicada).
--  - invoice_items.type (charge|discount|fee): sinal EXPLÍCITO, nunca por workflow (bug nº1).
--  - cleaning_goes_to (owner|bythec): flag POR INVOICE (não inventar).
--  - payments REGIME DE CAIXA: status due|received; só conta no caixa quando received.
--  - expenses: property_id e client_id OPCIONAIS (despesa do próprio negócio).
-- =============================================================================

-- Enums de finanças ----------------------------------------------------------
create type invoice_kind as enum ('seasonal', 'service');     -- temporada | serviço/long-term
create type invoice_item_type as enum ('charge', 'discount', 'fee');
create type cleaning_destination as enum ('owner', 'bythec'); -- flag por invoice
create type payment_status as enum ('due', 'received');       -- regime de caixa

-- =============================================================================
-- INVOICE NUMBER — sequence dedicada. TRAVADO: sequencial e único, sem reuso.
-- start 336: o último invoice real conhecido é #335 (Rainbow Ave). Ao migrar o
-- Bubble, ajustar o MAX(invoice_number)+1 antes de gerar novos. Sequence garante
-- que a numeração nunca "pula de propósito" nem é reutilizada.
-- =============================================================================
create sequence invoice_number_seq start with 336 increment by 1;

-- =============================================================================
-- INVOICES — 235 registros reais. Coração dos bugs do Bubble → resolvido aqui.
-- =============================================================================
create table invoices (
  id                       uuid primary key default gen_random_uuid(),

  -- TRAVADO: número sequencial, único, nunca reusado.
  invoice_number           bigint not null unique default nextval('invoice_number_seq'),

  client_id                uuid not null references clients(id)    on delete restrict,
  property_id              uuid references properties(id)          on delete restrict,
  kind                     invoice_kind not null,
  platform                 text,                  -- 'Airbnb' | 'VRBO' (seasonal)

  date                     date not null default current_date,
  due_date                 date,
  dates_reserved_start     date,                  -- DatesReserved (date range) → 2 colunas
  dates_reserved_end       date,
  paid_date                date,
  paid                     boolean not null default false,

  guest_name               text,
  notes                    text,
  pdf_url                  text,                  -- Storage: bucket "invoice-pdfs"

  -- ---- Campos SEASONAL (Airbnb/VRBO). Espelham a fórmula travada do bythec-mcp.
  --      A fórmula NÃO é recomputada aqui (vive no app/MCP); colunas guardam o resultado.
  room_fee                 numeric(12,2),         -- diária × noites
  rental_nights            integer,
  cleaning_fee             numeric(12,2),
  guest_service_fee        numeric(12,2),
  host_service_fee         numeric(12,2),         -- 15% × (room+cleaning)
  host_payout              numeric(12,2),         -- "You earn" (room+cleaning−host_service_fee)
  occupancy_taxes          numeric(12,2),         -- Airbnb remete ao governo; fora do payout
  lodging_taxes_vrbo       numeric(12,2),
  rental_discount          numeric(12,2),
  total_paid_by_guest      numeric(12,2),
  bythec_commission        numeric(12,2),         -- INCÓGNITA de cálculo: % confirmar c/ Andrea
  total_received_by_owner  numeric(12,2),
  -- TRAVADO: flag por invoice. cleaning fica com a ByTheC ou vai pro dono. NÃO inventar.
  cleaning_goes_to         cleaning_destination,
  -- Campos VRBO específicos.
  vrbo_commission          numeric(12,2),
  vrbo_payment_fee         numeric(12,2),
  vrbo_property_damage     numeric(12,2),

  -- ---- Campos SERVICE (long-term/manutenção). Labor + Material = Total.
  labor_total              numeric(12,2),
  material_total           numeric(12,2),

  archived_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on column invoices.invoice_number   is 'TRAVADO: sequencial e único, NUNCA pular/reusar. Vem de invoice_number_seq.';
comment on column invoices.cleaning_goes_to  is 'TRAVADO: flag POR INVOICE. owner|bythec. Decide se cleaning_fee é deduzido do payout do dono. NÃO inventar.';
comment on column invoices.bythec_commission is 'INCÓGNITA: % da comissão By the C — confirmar com Andrea. bythec-mcp recusa chutar.';
comment on column invoices.host_payout       is 'Airbnb "You earn" = room+cleaning − host_service_fee(15%). Fórmula travada no bythec-mcp.';

-- =============================================================================
-- INVOICE_ITEMS — itens de linha. FIX do bug nº1: sinal explícito por type.
-- =============================================================================
create table invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id) on delete cascade,
  description  text not null,
  total        numeric(12,2) not null,   -- sinal LIVRE (pode ser negativo)
  -- TRAVADO: o sinal é EXPLÍCITO pelo type, NUNCA decidido por workflow (bug nº1 do Bubble).
  type         invoice_item_type not null,
  guest        boolean not null default false,  -- aparece no overview do guest
  owner        boolean not null default false,  -- aparece no overview do owner
  created_at   timestamptz not null default now()
);
comment on column invoice_items.type  is 'TRAVADO: charge|discount|fee. O SINAL vem daqui, NUNCA de workflow. Resolve "não consigo inverter o sinal".';
comment on column invoice_items.total is 'Sinal livre. Convenção semântica dada por type, não pelo valor.';

-- on delete cascade aqui é OK: item de linha não tem valor histórico fora do invoice.
-- O invoice em si NUNCA é deletado (archived_at).

-- =============================================================================
-- PAYMENTS — aluguel year-round. REGIME DE CAIXA (mata o bug do accrual).
-- =============================================================================
create table payments (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references properties(id) on delete restrict,
  invoice_id    uuid references invoices(id) on delete set null,  -- opcional
  tenant_id     uuid references clients(id)  on delete set null,

  month         date,                  -- mês de competência (1º dia do mês)
  due_date      date,
  rent_amount   numeric(12,2) not null default 0,
  -- Comissão year-round = 10% do rent (YEAR_ROUND_COMMISSION_RATE no bythec-mcp).
  commission    numeric(12,2),
  -- TRAVADO: regime de caixa. Só conta no caixa quando status = 'received'.
  status        payment_status not null default 'due',
  received_at   timestamptz,           -- quando o dinheiro entrou de fato

  notes         text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on column payments.status      is 'TRAVADO: regime de CAIXA. due|received. NUNCA accrual. Só conta no caixa quando received.';
comment on column payments.commission  is 'Year-round = 10% do rent_amount. Cálculo travado no bythec-mcp (track_commission).';
comment on column payments.received_at is 'Data real da entrada. Comissão só conta a partir daqui.';

-- Comprovantes do pagamento: MÚLTIPLAS fotos/HEIC (pagamento parcelado).
create table payment_attachments (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references payments(id) on delete cascade,
  file_url     text not null,         -- Storage: bucket "payment-receipts"
  file_name    text,
  content_type text,                  -- image/heic, image/jpeg, application/pdf...
  archived_at  timestamptz,           -- trocar foto errada sem deletar o payment
  created_at   timestamptz not null default now()
);
comment on table payment_attachments is 'Múltiplos comprovantes por pagamento (parcelado, HEIC). Trocar foto errada = arquivar, não deletar o payment.';

-- =============================================================================
-- EXPENSES — despesa. FIX: property_id e client_id OPCIONAIS + category + vendor.
-- =============================================================================
create table expenses (
  id           uuid primary key default gen_random_uuid(),
  description  text not null,         -- nome/descrição livre
  price        numeric(12,2) not null,
  date         date not null default current_date,
  due_date     date,
  paid         boolean not null default false,
  paid_by      paid_by,
  category     text,                  -- livre (FIX: Bubble não tinha)
  vendor       text,                  -- livre (FIX: Bubble não tinha)
  -- OPCIONAIS: dá pra lançar despesa do próprio negócio sem amarrar a casa/cliente.
  property_id  uuid references properties(id) on delete set null,
  client_id    uuid references clients(id)    on delete set null,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on column expenses.property_id is 'OPCIONAL. FIX: Bubble exigia property/client. Despesa do escritório não amarra a ninguém.';
comment on column expenses.category    is 'Texto livre. FIX: Bubble não tinha categoria nem vendor.';

-- Índices --------------------------------------------------------------------
create index idx_invoices_client            on invoices (client_id);
create index idx_invoices_property          on invoices (property_id);
create index idx_invoices_number            on invoices (invoice_number);
create index idx_invoices_archived          on invoices (archived_at);
create index idx_invoices_kind              on invoices (kind);
create index idx_invoice_items_invoice      on invoice_items (invoice_id);
create index idx_payments_property          on payments (property_id);
create index idx_payments_tenant            on payments (tenant_id);
create index idx_payments_status            on payments (status);
create index idx_payments_archived          on payments (archived_at);
create index idx_payment_attachments_payment on payment_attachments (payment_id);
create index idx_expenses_property          on expenses (property_id);
create index idx_expenses_client            on expenses (client_id);
create index idx_expenses_archived          on expenses (archived_at);

-- updated_at triggers
create trigger trg_invoices_updated  before update on invoices  for each row execute function set_updated_at();
create trigger trg_payments_updated  before update on payments  for each row execute function set_updated_at();
create trigger trg_expenses_updated  before update on expenses  for each row execute function set_updated_at();
