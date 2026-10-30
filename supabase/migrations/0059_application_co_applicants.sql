-- =============================================================================
-- 0059 — Co-applicants na aplicação de aluguel (Andrea 2026-10-30)
-- =============================================================================
-- Ocupante 18+ responde se é co-applicant. Quem é preenche as mesmas informações
-- do candidato e paga $50. Cada co-applicant é uma LINHA própria em
-- rental_applications (mesmos campos, SSN cifrado, anexos, PDF e status), ligada à
-- aplicação principal. O pagamento fica na principal: stripe_payment_intent_id é
-- UNIQUE e 1 pagamento cobre o grupo inteiro.
-- SAFE / ADDITIVE: só adiciona coluna nullable; linhas antigas ficam NULL.
-- =============================================================================

alter table public.rental_applications
  add column if not exists primary_application_id uuid
    references public.rental_applications(id) on delete cascade;

comment on column public.rental_applications.primary_application_id is
  'Preenchido só em co-applicant: aponta pra aplicação principal que pagou o grupo.';

create index if not exists idx_rental_applications_primary
  on public.rental_applications (primary_application_id);

-- Andrea 2026-10-30: saber se o número informado é SSN ou ITIN. Aplicações
-- antigas ficam NULL (não se sabe qual dos dois foi digitado).
alter table public.rental_applications
  add column if not exists tax_id_type text check (tax_id_type in ('ssn','itin'));
