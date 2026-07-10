import { AppShell } from "@/components/AppShell";
import { AuthHashHandler } from "@/components/AuthHashHandler";
import type { SidebarUser } from "@/components/Sidebar";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  effectiveCaps,
  canManageUsers,
  can,
  ROLE_LABEL,
  type AppRole,
  type Capability,
} from "@/lib/auth/capabilities";
import { computeEscalation, badgeCountForViewer } from "@/lib/reminders";
import type { ReminderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

// Contagem do badge da sidebar = lembretes abertos escalados PRO usuário logado
// (owner vê escalações de owner; manager, as de manager; demais = 0). Computado
// ao vivo. Falha silenciosa (0) se a tabela ainda não existe / DB desconectado.
async function remindersBadgeCount(role: AppRole): Promise<number> {
  if (role !== "owner" && role !== "manager") return 0;
  try {
    const supabase = createClient();
    const [{ data: rems }, { data: people }] = await Promise.all([
      supabase
        .from("reminders")
        .select("status, created_at, due_date, assigned_to")
        .eq("status", "open")
        .is("archived_at", null),
      supabase.rpc("reminder_people"),
    ]);
    const roleById = new Map(
      ((people ?? []) as Array<{ id: string; role: AppRole }>).map((p) => [p.id, p.role])
    );
    const escalations = ((rems ?? []) as Array<{
      status: ReminderStatus;
      created_at: string;
      due_date: string | null;
      assigned_to: string;
    }>).map((r) =>
      computeEscalation({
        status: r.status,
        created_at: r.created_at,
        due_date: r.due_date,
        assignee_role: roleById.get(r.assigned_to) ?? null,
      })
    );
    return badgeCountForViewer(role, escalations);
  } catch {
    return 0;
  }
}

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

  const remindersBadge = can(profile, "reminders.view")
    ? await remindersBadgeCount(profile.role)
    : 0;

  return (
    <AppShell
      caps={caps}
      canManageUsers={canManageUsers(profile)}
      user={user}
      remindersBadge={remindersBadge}
    >
      {/* Rede de segurança: se um link de convite/recuperação cair numa rota do
          painel com a sessão no hash, finaliza o fluxo (grava sessão do convidado
          + manda pra criar senha). Cobre a colisão "dona logada testando convite". */}
      <AuthHashHandler />
      {children}
    </AppShell>
  );
}
