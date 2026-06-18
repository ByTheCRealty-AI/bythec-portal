// ============================================================================
// TEMPORÁRIO — PRÉ-AUTH (Onda 2, Fase 1)
//
// Este client roda SOMENTE no servidor (Server Components / Server Actions /
// Route Handlers) e usa a SERVICE_ROLE key, que BYPASSA O RLS.
//
// Por quê: o RLS está LIGADO em todas as tabelas e ainda NÃO existem policies
// nem login. Logo, a chave anon não lê nada (comportamento correto e seguro).
// O banco fica TRANCADO; só este servidor, com a chave secreta, acessa.
// Enquanto o painel é uma ferramenta INTERNA sem autenticação, ele lê/escreve
// via service_role no servidor.
//
// >>> QUANDO O LOGIN (SUPABASE AUTH) ENTRAR, TROCAR ESTE ARQUIVO POR:
//     createServerClient (de @supabase/ssr) + ANON key + cookies do Next
//     + policies de RLS por usuário. O service_role sai de cena. <<<
//
// REGRA DE OURO: a service_role key NUNCA pode ir pro browser. Por isso ela é
// lida de SUPABASE_SERVICE_ROLE_KEY (SEM o prefixo NEXT_PUBLIC_, que é o único
// jeito do Next vazar env pro client). Este módulo só pode ser importado por
// código server-side. Nunca importar de um Client Component ("use client").
// ============================================================================

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Mantém a assinatura `createClient()` (síncrona) pra não quebrar os call sites
// existentes em actions.ts e nas pages (que fazem `const supabase = createClient()`).
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Falha clara em RUNTIME (request-time), nunca em build-time. As pages que
  // chamam isso são `force-dynamic` + try/catch, então o build na Vercel não
  // depende dessas envs pra compilar.
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase env ausente. Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY " +
        "nas variáveis de ambiente (Vercel · Project Settings · Environment Variables)."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
