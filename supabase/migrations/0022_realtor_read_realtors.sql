-- =============================================================================
-- By the C — Migration 0022 · Realtor lê a roster de realtors
-- =============================================================================
-- Complemento do 0021. O realtor precisa LER a tabela `realtors` pra escolher um
-- realtor no form de Sales (add buyer/seller / add for-sale listing). Write segue
-- restrito a users.manage_access.
-- =============================================================================
drop policy if exists realtors_select on realtors;
create policy realtors_select on realtors for select
  using (
    has_cap('clients.edit') or has_cap('properties.edit') or has_cap('financials.full')
    or has_cap('clients.own') or has_cap('properties.own')
  );
