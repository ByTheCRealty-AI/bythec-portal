// =============================================================================
// By the C — Sessão & profile do usuário logado (server-side)
// =============================================================================
// Helpers usados por Server Components / Server Actions pra:
//  - pegar o profile do usuário autenticado (1 round-trip, cacheado por request)
//  - exigir uma capacidade (redireciona pra /login ou pra estado "sem acesso")
// =============================================================================

import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, type Capability, type ProfileLike } from "@/lib/auth/capabilities";

// cache(): garante 1 query por request mesmo se vários componentes chamarem.
export const getProfile = cache(async (): Promise<ProfileLike | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, address, address_line1, address_line2, city, state, zip, role, permissions, active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as ProfileLike;
});

// Exige sessão válida + profile ativo. Sem isso -> /login.
export async function requireProfile(): Promise<ProfileLike> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.active) redirect("/login?reason=inactive");
  return profile;
}

// Exige uma capacidade. Sem ela -> joga pro Overview (sem vazar a tela).
export async function requireCapability(cap: Capability): Promise<ProfileLike> {
  const profile = await requireProfile();
  if (!can(profile, cap)) redirect("/?denied=" + encodeURIComponent(cap));
  return profile;
}
