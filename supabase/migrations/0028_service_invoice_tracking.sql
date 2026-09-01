-- =============================================================================
-- 0028_service_invoice_tracking.sql
-- Service invoices: worker-cost + 10% commission model + 5-state tracking.
-- Approved by Andrea 2026-08-10 (see wiki/operations/decisions.md).
--
-- MODEL: Andrea enters the WORKER's cost per line (labor or material). By the C's
-- 10% commission is BAKED INTO the owner-facing price (never a separate line on
-- the PDF): item.total = round(cost * 1.10, 2). The existing owner-facing columns
-- (invoice_items.total, invoices.labor_total/material_total) STAY owner-facing.
-- We only ADD the internal worker cost + the tracking states.
--
-- No back-fill: 0 service invoices exist yet (verified 2026-08-10).
-- =============================================================================

-- Worker cost per line item (labor or material). NULL on seasonal items.
alter table invoice_items add column if not exists cost numeric;
comment on column invoice_items.cost is 'SERVICE: worker''s cost for this line. Owner-facing total = round(cost*1.10,2). NULL on seasonal items.';

-- Service invoice internal fields.
alter table invoices add column if not exists work_date date;
alter table invoices add column if not exists provider_id uuid references service_providers(id) on delete set null;
alter table invoices add column if not exists labor_cost numeric;         -- worker labor cost (internal)
alter table invoices add column if not exists material_cost numeric;      -- worker material cost (internal)
alter table invoices add column if not exists service_commission numeric; -- By the C 10% total (internal)

comment on column invoices.work_date is 'SERVICE: date the work was done (distinct from `date` = invoice-created date).';
comment on column invoices.provider_id is 'SERVICE: worker/provider who did the work (service_providers). Optional (in-house crew leaves it null). For records + 1099s.';
comment on column invoices.service_commission is 'SERVICE: By the C 10% commission = (labor_total+material_total) - (labor_cost+material_cost). Internal — baked into the owner price, never shown on the PDF.';

-- Five-state tracking. Owner-paid REUSES the existing paid/paid_date columns.
alter table invoices add column if not exists sent_to_owner boolean not null default false;
alter table invoices add column if not exists sent_at date;
alter table invoices add column if not exists labor_paid boolean not null default false;
alter table invoices add column if not exists labor_paid_at date;
alter table invoices add column if not exists material_paid boolean not null default false;
alter table invoices add column if not exists material_paid_at date;
alter table invoices add column if not exists commission_collected boolean not null default false;
alter table invoices add column if not exists commission_collected_at date;

comment on column invoices.commission_collected is 'SERVICE: By the C''s 10% collected. Auto-ticks when the owner is marked paid (override allowed) — commission lands with the owner payment.';

create index if not exists idx_invoices_provider on invoices (provider_id);
