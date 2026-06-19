// =============================================================================
// Supabase — ADMIN client (SERVICE_ROLE) · SOMENTE pra tarefas administrativas
// =============================================================================
// BYPASSA O RLS. Uso EXCLUSIVO: a server action de convidar/criar login
// (auth.admin.inviteUserByEmail) e operações de admin de usuário (deletar login).
// NUNCA usar este client pra leitura/escrita normal do painel — pra isso existe
// ./server.ts (sessão do usuário + RLS).
//
// REGRA DE OURO: SUPABASE_SERVICE_ROLE_KEY NUNCA vai pro browser (sem prefixo
// NEXT_PUBLIC_). Este módulo é server-only. Toda action que o importa DEVE checar
// a capacidade do chamador ANTES (defesa em profundidade — o RLS não cobre
// auth.admin, que roda como service_role).
// =============================================================================

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin env ausente. Configure NEXT_PUBLIC_SUPABASE_URL e " +
        "SUPABASE_SERVICE_ROLE_KEY (Vercel · Project Settings · Environment Variables)."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
