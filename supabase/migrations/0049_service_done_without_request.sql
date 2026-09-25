-- =============================================================================
-- By the C — Migration 0049 · Concluir o SERVIÇO sem fechar o tenant request
-- =============================================================================
-- Andrea, 2026-09-25: "when a service and tenant request are linked, when one is
-- clicked as done, then the other is as well. but there also needs to be the
-- option to only click done on the service but not the tenant request."
--
-- Até aqui o trigger sync_linked_request_service_done fechava SEMPRE os dois,
-- sem escapatória. Caso real: o prestador terminou a parte dele (serviço done)
-- mas o problema do inquilino continua (request segue aberto).
--
-- Agora o serviço carrega a intenção: close_request_on_done. Default TRUE, que
-- mantém o comportamento atual pra quem não mexer em nada. A tela desmarca
-- quando ela quiser fechar só o serviço, e grava a flag JUNTO com o status —
-- o trigger lê o valor novo na mesma linha, então não tem corrida.
--
-- NÃO muda o outro sentido: marcar o REQUEST como done continua fechando os
-- serviços ligados (fechou o problema do inquilino, acabou o trabalho).
-- =============================================================================

alter table services
  add column if not exists close_request_on_done boolean not null default true;

comment on column services.close_request_on_done is
  'Quando este serviço vira done, fecha junto o tenant request ligado? Default true. A tela desmarca pra concluir só o serviço e deixar o request aberto.';

create or replace function sync_linked_request_service_done() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
begin
  if tg_table_name = 'services' then
    if new.tenant_request_id is not null then
      -- Só fecha o request quando o serviço PEDE isso (0049).
      if new.status = 'done' and coalesce(new.close_request_on_done, true) then
        update public.tenant_requests set status='done', done_at=coalesce(done_at, now())
          where id = new.tenant_request_id and status <> 'done';
      elsif new.status <> 'done'
            and coalesce(new.close_request_on_done, true)
            and (select status from public.tenant_requests where id = new.tenant_request_id) = 'done' then
        update public.services set status='done', done_at=coalesce(done_at, now())
          where id = new.id and status <> 'done';
      end if;
    end if;
  elsif tg_table_name = 'tenant_requests' then
    if new.status = 'done' then
      update public.services set status='done', done_at=coalesce(done_at, now())
        where tenant_request_id = new.id and status <> 'done';
    end if;
  end if;
  return new;
end;
$function$;
