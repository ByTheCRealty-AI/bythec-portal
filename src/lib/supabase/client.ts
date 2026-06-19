// =============================================================================
// Supabase — BROWSER client (Client Components / "use client")
// =============================================================================
// Usa a ANON key (pública por design) + sessão por cookie do @supabase/ssr.
// O RLS no banco é a camada de segurança real. Este client NUNCA vê service_role.
// =============================================================================

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase env ausente no browser. Configure NEXT_PUBLIC_SUPABASE_URL e " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY (Vercel · Project Settings · Environment Variables)."
    );
  }

  return createBrowserClient(url, anonKey);
}
