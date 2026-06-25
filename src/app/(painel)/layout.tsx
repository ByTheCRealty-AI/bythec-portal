import { AppShell } from "@/components/AppShell";
import { AuthHashHandler } from "@/components/AuthHashHandler";
import type { SidebarUser } from "@/components/Sidebar";
import { requireProfile } from "@/lib/auth/session";
import {
  effectiveCaps,
  canManageUsers,
  ROLE_LABEL,
  type Capability,
} from "@/lib/auth/capabilities";

export const dynamic = "force-dynamic";

function initialsFrom(name: string | null, email: string | null): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  // Trava: sem sessão/profile ativo -> /login (defesa além do middleware).
  const profile = await requireProfile();

  const caps: Capability[] = Array.from(effectiveCaps(profile));
  const user: SidebarUser = {
    name: profile.full_name || profile.email || "User",
    email: profile.email || "",
    roleLabel: ROLE_LABEL[profile.role],
    initials: initialsFrom(profile.full_name, profile.email),
  };

  return (
    <AppShell caps={caps} canManageUsers={canManageUsers(profile)} user={user}>
      {/* Rede de segurança: se um link de convite/recuperação cair numa rota do
          painel com a sessão no hash, finaliza o fluxo (grava sessão do convidado
          + manda pra criar senha). Cobre a colisão "dona logada testando convite". */}
      <AuthHashHandler />
      {children}
    </AppShell>
  );
}
