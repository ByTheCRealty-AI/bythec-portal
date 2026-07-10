-- =============================================================================
-- By the C — Migration 0016 · Reminders — realtor vê SÓ os seus
-- =============================================================================
-- Ajuste de escopo sobre o 0015. Papéis internos (owner/manager/secretary)
-- continuam vendo o quadro COMPARTILHADO inteiro. O realtor passa a ver/gerir
-- SOMENTE os lembretes designados a ele mesmo (assigned_to = auth.uid()).
--
-- A ESCALAÇÃO não muda: realtor já é tratado como "abaixo do manager" no app
-- (src/lib/reminders.ts) — 3d → manager, 5d → owner. Managers/owner enxergam
-- TODOS os lembretes (inclusive os do realtor), então a escalação aparece
-- normalmente no board deles quando um lembrete de realtor vence.
--
-- TRAVADO: arquivar, nunca deletar (só owner hard-delete). Aplicar via MCP.
-- =============================================================================

-- SELECT: internos veem tudo; realtor vê só os designados a si.
drop policy if exists reminders_select on reminders;
create policy reminders_select on reminders for select
  using (
    has_cap('reminders.view')
    and (current_app_role() <> 'realtor' or assigned_to = auth.uid())
  );

-- INSERT: internos designam a qualquer pessoa; realtor só cria pra si mesmo.
drop policy if exists reminders_insert on reminders;
create policy reminders_insert on reminders for insert
  with check (
    has_cap('reminders.manage')
    and (current_app_role() <> 'realtor' or assigned_to = auth.uid())
  );

-- UPDATE: internos editam tudo; realtor só mexe (completa/edita) nos seus, e não
-- pode reassignar pra outra pessoa (with check trava o novo assigned_to).
drop policy if exists reminders_update on reminders;
create policy reminders_update on reminders for update
  using (
    has_cap('reminders.manage')
    and (current_app_role() <> 'realtor' or assigned_to = auth.uid())
  )
  with check (
    has_cap('reminders.manage')
    and (current_app_role() <> 'realtor' or assigned_to = auth.uid())
  );

-- DELETE segue owner-only (policy reminders_delete do 0015, inalterada).

-- reminder_people(): pro dropdown/diretório. Realtor só enxerga a si mesmo
-- (evita vazar a lista de pessoas e casa com o "só posso me designar").
create or replace function reminder_people()
returns table (id uuid, full_name text, role app_role)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.role
  from public.profiles p
  where p.active = true
    and has_cap('reminders.view')
    and (current_app_role() <> 'realtor' or p.id = auth.uid())
  order by p.full_name nulls last
$$;
