-- =============================================================================
-- 0057 — Rental application: situação de emprego (Employed / Self-employed /
-- Retired) + comprovante de renda como anexo.
-- =============================================================================
-- Aplicações antigas ficam com employment_status NULL (= employed, campos de
-- empregador). monthly_income é reaproveitado (renda total / média) e
-- length_of_employment guarda "há quanto tempo autônomo".
-- =============================================================================

alter table public.rental_applications
  add column if not exists employment_status text
    check (employment_status in ('employed','self_employed','retired')),
  add column if not exists retirement_income_sources text[],
  add column if not exists retired_since text,
  add column if not exists business_name text,
  add column if not exists business_type text;

alter table public.rental_application_attachments
  drop constraint if exists rental_application_attachments_category_check;
alter table public.rental_application_attachments
  add constraint rental_application_attachments_category_check
  check (category in ('applicant_id','occupant_id','income_proof'));
