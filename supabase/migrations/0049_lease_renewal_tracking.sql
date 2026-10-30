-- 0049 — Rastreio da renovação de contrato (Andrea 2026-09-28).
-- Overview: tick "renewal sent". Página da propriedade: enviada + aceita/recusada
-- + o que muda (novo aluguel e novas datas). É REGISTRO — não altera rent_price
-- nem rental_start/end sozinho (isso continua sendo o Edit property).
alter table properties add column if not exists renewal_sent_at date;
alter table properties add column if not exists renewal_response text check (renewal_response in ('accepted','declined'));
alter table properties add column if not exists renewal_response_at date;
alter table properties add column if not exists renewal_new_rent numeric;
alter table properties add column if not exists renewal_new_start date;
alter table properties add column if not exists renewal_new_end date;

-- Tirar o inquilino também zera o rastreio (a 0047 já zerava as datas do contrato).
create or replace function public.clear_lease_when_vacated()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tenant_id is null and old.tenant_id is not null then
    new.rental_start := null;
    new.rental_end := null;
    new.renewal_dismissed_for := null;
    new.renewal_sent_at := null;
    new.renewal_response := null;
    new.renewal_response_at := null;
    new.renewal_new_rent := null;
    new.renewal_new_start := null;
    new.renewal_new_end := null;
  end if;
  return new;
end;
$$;
