-- =============================================================================
-- 0035_general_invoice_sequence.sql
-- General invoices ganham a PRÓPRIA sequência de numeração (começa em 100),
-- independente de seasonal. Antes general dividia `invoice_number_seq` com
-- seasonal → os números se misturavam. Agora os 3 tipos têm contadores próprios
-- que não se sobrepõem:
--   service  → service_invoice_number_seq   (próximo: 158)
--   seasonal → invoice_number_seq           (próximo: 400)
--   general  → general_invoice_number_seq   (começa em 100)
-- Pedido da Andrea 2026-08-13. Como não existe nenhum invoice general ainda,
-- criar a sequência começando em 100 faz o 1º general ser #100.
-- =============================================================================

create sequence if not exists general_invoice_number_seq start with 100 increment by 1;
grant usage on sequence general_invoice_number_seq to anon, authenticated, service_role;

create or replace function public.assign_invoice_number()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.invoice_number is null then
    if new.kind = 'service' then
      new.invoice_number := nextval('service_invoice_number_seq');
    elsif new.kind = 'general' then
      new.invoice_number := nextval('general_invoice_number_seq');
    else
      new.invoice_number := nextval('invoice_number_seq');
    end if;
  end if;
  return new;
end;
$function$;
