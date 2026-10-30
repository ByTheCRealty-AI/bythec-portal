-- 0047 — Casa ficou sem inquilino => datas do contrato somem, AUTOMATICAMENTE.
-- Andrea 2026-09-16: "when removing an old tenant, the lease dates need to also
-- automatically clear".
-- O botão Make vacant já limpava (clearPropertyTenantAction, 2026-09-11), mas
-- havia outro caminho: apagar o CLIENTE inquilino dispara o FK
-- properties.tenant_id ON DELETE SET NULL, que tira o inquilino e deixava as
-- datas velhas. Regra no banco cobre QUALQUER caminho (app, FK, SQL).
-- rent_price fica de propósito (é o preço pedido da casa, usado pelas listings).
-- renewal_dismissed_for sai junto: era o "dispensado" daquele rental_end.

create or replace function public.clear_lease_when_vacated()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tenant_id is null and old.tenant_id is not null then
    new.rental_start := null;
    new.rental_end := null;
    new.renewal_dismissed_for := null;
  end if;
  return new;
end;
$$;

-- BEFORE UPDATE sem "of tenant_id": também pega a atualização feita pelo FK.
drop trigger if exists trg_clear_lease_when_vacated on public.properties;
create trigger trg_clear_lease_when_vacated
  before update on public.properties
  for each row execute function public.clear_lease_when_vacated();
