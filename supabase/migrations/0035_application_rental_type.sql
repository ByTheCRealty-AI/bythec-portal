-- 0035 · rental application: tipo de aluguel (year-round vs winter/off-season)
-- + data desejada de início do contrato.
alter table public.rental_applications
  add column if not exists rental_type text check (rental_type in ('year_round','winter')),
  add column if not exists lease_start date;

comment on column public.rental_applications.rental_type is
  'Tipo de aluguel que o candidato quer: year_round (anual) ou winter (off-season/temporada de inverno).';
comment on column public.rental_applications.lease_start is
  'Data desejada de início do contrato (escolhida pelo candidato no /apply).';
