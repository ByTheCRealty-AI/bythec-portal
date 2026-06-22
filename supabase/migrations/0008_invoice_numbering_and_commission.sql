-- =============================================================================
-- By the C — Migration 0008 · Invoice numbering (per-kind) + commission rate
-- =============================================================================
-- Contexto: o módulo de Invoices precisa de DUAS numerações independentes:
--   - SEASONAL (Airbnb/VRBO) continua usando invoice_number_seq (último real #335,
--     sequence começa em 336 — definida em 0002).
--   - SERVICE (manutenção/long-term) ganha sequence própria service_invoice_number_seq
--     (último service real conhecido #141, então começa em 142).
-- Como as duas sequences vão eventualmente se sobrepor, a unicidade NÃO pode ser
-- global em invoice_number — passa a ser POR (kind, invoice_number).
--
-- TRAVADO (regras de negócio que esta migration sustenta):
--   - número sequencial, único POR KIND, NUNCA pular/reusar (sequences dedicadas).
--   - atribuição do número é ATÔMICA no banco (trigger BEFORE INSERT) — sem race
--     entre requests concorrentes do app.
--   - seasonal_commission_rate vive na PROPERTY (default 0.10), editável por invoice.
--
-- IMPORTANTE: aplicar via Supabase MCP (o Victor não tem acesso ao banco).
-- RLS já existe (0005) e NÃO é tocada aqui.
-- Idempotente onde dá (if exists / if not exists / or replace) pra reaplicar.
-- =============================================================================

-- 1) Sequence dedicada pros invoices de SERVICE. Último service real = #141.
create sequence if not exists service_invoice_number_seq start with 142 increment by 1;

-- 2) Trocar a unicidade GLOBAL por unicidade POR KIND + remover o default da coluna.
--    (o default global nextval('invoice_number_seq') era usado por ambos os kinds;
--     agora quem atribui é o trigger, escolhendo a sequence certa pelo kind.)
alter table invoices alter column invoice_number drop default;

-- O unique global veio embutido na coluna (UNIQUE em 0002). O nome esperado é
-- invoices_invoice_number_key; mas pra ser robusto, dropamos QUALQUER unique
-- constraint que cubra exatamente a coluna invoice_number sozinha.
alter table invoices drop constraint if exists invoices_invoice_number_key;
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where rel.relname = 'invoices'
      and nsp.nspname = 'public'
      and con.contype = 'u'
      and con.conkey = array[
        (select attnum from pg_attribute
          where attrelid = rel.oid and attname = 'invoice_number')
      ]
  loop
    execute format('alter table public.invoices drop constraint %I', c.conname);
  end loop;
end $$;

-- Unicidade correta: (kind, invoice_number). Idempotente via nome explícito.
alter table invoices drop constraint if exists invoices_kind_number_uniq;
alter table invoices add constraint invoices_kind_number_uniq unique (kind, invoice_number);

-- invoice_number deixa de ser NOT NULL na inserção do app (o trigger preenche
-- antes do commit). Mantemos a coluna NOT NULL no final via trigger garantindo
-- valor; para não quebrar inserts que ainda mandam null, relaxamos o NOT NULL.
alter table invoices alter column invoice_number drop not null;

-- 3) Trigger BEFORE INSERT: se invoice_number vier null, atribui da sequence do kind.
--    Atômico, sem race no app.
create or replace function assign_invoice_number()
returns trigger
language plpgsql
as $$
begin
  if new.invoice_number is null then
    if new.kind = 'service' then
      new.invoice_number := nextval('service_invoice_number_seq');
    else
      new.invoice_number := nextval('invoice_number_seq');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoices_assign_number on invoices;
create trigger trg_invoices_assign_number
  before insert on invoices
  for each row execute function assign_invoice_number();

-- 4) Comissão seasonal POR PROPERTY (By the C %), default 10%. Editável por invoice
--    (a coluna bythec_commission no invoice guarda o valor já calculado/travado).
alter table properties add column if not exists seasonal_commission_rate numeric not null default 0.10;
comment on column properties.seasonal_commission_rate is 'By the C seasonal commission rate (fraction, default 0.10 = 10%). Editável por invoice na geração.';

-- 5) Categoria do item de linha (SERVICE): 'labor' | 'material'. Livre/nullable
--    pra não conflitar com itens seasonal (guest/owner), que não usam category.
alter table invoice_items add column if not exists category text;
comment on column invoice_items.category is 'SERVICE invoice: ''labor'' | ''material''. Null para itens seasonal (guest/owner).';

-- 6) Endereço de serviço DIGITADO (SERVICE): quando o trabalho não está numa
--    property salva. Se property_id existe, usa o endereço da property; senão
--    cai neste texto livre. Nullable.
alter table invoices add column if not exists service_address text;
comment on column invoices.service_address is 'SERVICE invoice: endereço digitado quando não há property_id. Detalhe usa property.address quando houver, senão este campo.';
