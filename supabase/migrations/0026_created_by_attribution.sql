-- =============================================================================
-- 0025 — Autoria (created_by) em notes / services / tenant_requests
-- =============================================================================
-- Andrea quer ver QUEM criou cada nota, serviço e tenant request (um selinho
-- pequeno com o nome no rodapé). Guardamos o autor (created_by -> profiles) e
-- carimbamos no insert (server action). Linhas antigas ficam null (sem histórico
-- de autoria) — mostram nada. ON DELETE SET NULL: apagar um usuário não bloqueia
-- nem destrói o registro, só zera a autoria.
-- =============================================================================

alter table notes           add column if not exists created_by uuid references profiles(id) on delete set null;
alter table services        add column if not exists created_by uuid references profiles(id) on delete set null;
alter table tenant_requests add column if not exists created_by uuid references profiles(id) on delete set null;

comment on column notes.created_by           is 'Quem criou a nota (carimbo no insert). null = legado/desconhecido.';
comment on column services.created_by        is 'Quem registrou o serviço. null = legado/desconhecido.';
comment on column tenant_requests.created_by is 'Quem abriu o request. null = legado/desconhecido.';

-- Diretório mínimo id -> nome pros nomes de autor renderizarem. SECURITY DEFINER
-- porque o profiles_select do RLS só deixa cada um ver o próprio perfil (a
-- secretária não enxergaria o nome de quem criou). Aqui expomos SÓ id + nome
-- (nada de email/telefone), e só pra staff interno. Espelha reminder_people().
create or replace function operator_names()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from public.profiles p
  where current_app_role() in ('owner', 'manager', 'secretary')
$$;

grant execute on function operator_names() to authenticated;
