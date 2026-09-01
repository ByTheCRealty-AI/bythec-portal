-- =============================================================================
-- By the C — Migration 0043 · UM cliente pode ter VÁRIOS papéis
-- =============================================================================
-- Andrea, 2026-08-27: "there are clients that are both a landlord and a for sale
-- client."
--
-- Caso real na base: Giancarlo Nobre (giancnusa@gmail.com) existia DUAS vezes —
-- uma linha `landlord` com 7 propriedades penduradas e outra `buy_sell_client`
-- como seller. Mesma pessoa, dois cadastros, porque `client_type` só cabia um.
-- Toda nota, telefone e histórico ficava partido entre as duas.
--
-- Mesmo padrão de 0040 (listings) e 0042 (properties): flags independentes, com
-- `client_type` DERIVADO por trigger pra não quebrar as leituras existentes.
--
-- PRECEDÊNCIA do derivado: landlord > airbnb_owner > tenant > off_season_tenant
-- > buy_sell_client. Relação de dono é a manchete (é o contrato recorrente que
-- sustenta o negócio); comprar/vender é episódico e entra por último.
--
-- ATENÇÃO: por causa dessa precedência, a tela Sales NÃO pode mais filtrar por
-- client_type = 'buy_sell_client' — o Giancarlo derivaria pra 'landlord' e
-- sumiria de lá. Filtro passa a ser is_buyer_seller. Mesma armadilha vale pra
-- todos os filtros por tipo.
-- =============================================================================

alter table clients add column if not exists is_tenant            boolean not null default false;
alter table clients add column if not exists is_landlord          boolean not null default false;
alter table clients add column if not exists is_airbnb_owner      boolean not null default false;
alter table clients add column if not exists is_buyer_seller      boolean not null default false;
alter table clients add column if not exists is_off_season_tenant boolean not null default false;

comment on column clients.is_landlord is 'Dono de imóvel de aluguel anual gerido pela By the C. Pode acumular com is_buyer_seller (dono que também vende).';
comment on column clients.is_buyer_seller is 'Está comprando ou vendendo com a By the C. Filtro da tela Sales — use ESTA coluna, não client_type.';
comment on column clients.client_type is
  'DERIVADO das flags is_* por trigger (precedência landlord > airbnb_owner > tenant > off_season_tenant > buy_sell_client). Mantido pra não quebrar leituras antigas. NÃO editar à mão — escreva nas flags. Filtros devem usar as flags.';

-- Backfill: o tipo único vira a flag equivalente.
update clients set is_tenant            = true where client_type = 'tenant'            and is_tenant            = false;
update clients set is_airbnb_owner      = true where client_type = 'airbnb_owner'      and is_airbnb_owner      = false;
update clients set is_landlord          = true where client_type = 'landlord'          and is_landlord          = false;
update clients set is_buyer_seller      = true where client_type = 'buy_sell_client'   and is_buyer_seller      = false;
update clients set is_off_season_tenant = true where client_type = 'off_season_tenant' and is_off_season_tenant = false;

-- Rede de segurança: sem papel nenhum cai em tenant (caso mais comum — 30 de 62).
update clients
   set is_tenant = true
 where not (is_tenant or is_landlord or is_airbnb_owner or is_buyer_seller or is_off_season_tenant);

create or replace function sync_client_type() returns trigger as $$
begin
  if not (new.is_tenant or new.is_landlord or new.is_airbnb_owner
          or new.is_buyer_seller or new.is_off_season_tenant) then
    new.is_tenant := true;
  end if;

  new.client_type := case
    when new.is_landlord          then 'landlord'::client_type
    when new.is_airbnb_owner      then 'airbnb_owner'::client_type
    when new.is_tenant            then 'tenant'::client_type
    when new.is_off_season_tenant then 'off_season_tenant'::client_type
    else 'buy_sell_client'::client_type
  end;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_client_type on clients;
create trigger trg_sync_client_type
  before insert or update on clients
  for each row execute function sync_client_type();

create index if not exists idx_clients_roles
  on clients (is_tenant, is_landlord, is_airbnb_owner, is_buyer_seller, is_off_season_tenant);
