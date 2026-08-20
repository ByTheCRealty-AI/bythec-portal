-- 0036 · propriedade escolhe pra QUAIS tipos de aluguel aceita aplicação no /apply.
-- accepting_applications (flag mestre) passa a ser derivado (aceita ao menos 1 tipo).
alter table public.properties
  add column if not exists accepts_year_round boolean not null default false,
  add column if not exists accepts_winter boolean not null default false;

comment on column public.properties.accepts_year_round is
  'Aceita aplicação de aluguel ANUAL no /apply (aparece no dropdown quando o candidato escolhe year-round).';
comment on column public.properties.accepts_winter is
  'Aceita aplicação de aluguel de INVERNO/off-season no /apply.';

-- Backfill: propriedades já marcadas accepting_applications (flag antiga, sem tipo)
-- viram year-round por padrão pra não sumirem do dropdown filtrado.
update public.properties
   set accepts_year_round = true
 where accepting_applications = true
   and accepts_year_round = false
   and accepts_winter = false;
