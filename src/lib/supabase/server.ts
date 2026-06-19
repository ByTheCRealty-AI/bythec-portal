// =============================================================================
// Supabase — SERVER client (Server Components / Server Actions / Route Handlers)
// =============================================================================
// AUTH LIGADO (Onda 2, Fase Auth): este client usa a ANON key + a SESSÃO DO
// USUÁRIO LOGADO (cookies do @supabase/ssr). Toda leitura/escrita passa pelo RLS
// do banco em nome do usuário autenticado — esta é a camada SEGURA.
//
// A service_role NÃO mora mais aqui. Ela vive SÓ em ./admin.ts, usada apenas
// pela server action de convite/criação de usuário (auth.admin.inviteUserByEmail).
//
// REGRA DE OURO: service_role NUNCA vai pro browser. anon key é pública por design.
// Este módulo é server-only; nunca importar de um Client Component ("use client").
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase env ausente. Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "nas variáveis de ambiente (Vercel · Project Settings · Environment Variables)."
    );
  }

  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Em Server Components puros o set de cookie pode lançar — é esperado.
        // O middleware é quem renova a sessão e escreve cookies de resposta.
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // No-op: chamado de um Server Component sem acesso de escrita ao cookie.
        }
      },
    },
  });
}
