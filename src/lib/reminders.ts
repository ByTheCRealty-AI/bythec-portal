// =============================================================================
// By the C — Escalação de lembretes (COMPUTADA AO VIVO)
// =============================================================================
// Alertas de lembrete são IN-PORTAL (sem email, sem cron, sem timestamps de
// alerta gravados). Tudo é computado no load a partir de created_at (ou due_date
// se setado) contra "hoje" em America/New_York (Cape Cod).
//
// Regras (confirmadas com Andrea 2026-07-09):
//   - assignee secretary/realtor: manager alertado em 3d, owner em 5d.
//   - assignee manager:           pula o passo do manager; owner alertado em 3d.
//   - assignee owner:             sem escalação.
//   - completar (status='done') zera as duas escalações na hora.
//
// Puro (sem I/O) — pode ser importado tanto por Server Components quanto por
// componentes client. Mantido em sincronia com o texto da spec em
// wiki/operations/specs/reminders-followups.md.
// =============================================================================

import type { AppRole } from "@/lib/auth/capabilities";
import type { ReminderStatus } from "@/lib/types";

// Papéis "abaixo" do manager na cadeia de escalação.
const BELOW_MANAGER: AppRole[] = ["secretary", "realtor"];

// Número do dia (dias inteiros desde a epoch) do calendário em America/New_York.
// Usar o dia-calendário evita bug de fuso: "criado há 3 dias" = ageDays 3,
// independente da hora do dia.
function nyDayNumber(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  if (!y || !m || !day) return Math.floor(d.getTime() / 86_400_000);
  return Math.floor(Date.UTC(y, m - 1, day) / 86_400_000);
}

// Dias inteiros entre agora (NY) e a âncora (created_at timestamptz OU due_date
// YYYY-MM-DD). Nunca negativo — uma due_date futura conta como 0.
export function ageDays(anchor: string, now: Date = new Date()): number {
  // date puro (YYYY-MM-DD) -> tratar como meio-dia pra não deslocar o calendário.
  const iso = anchor.length === 10 ? `${anchor}T12:00:00Z` : anchor;
  const a = new Date(iso);
  if (Number.isNaN(a.getTime())) return 0;
  return Math.max(0, nyDayNumber(now) - nyDayNumber(a));
}

export interface ReminderEscalation {
  ageDays: number;
  // manager (todos os managers) é alertado no portal.
  escalatedToManager: boolean;
  // owner (Andrea) é alertado no portal.
  escalatedToOwner: boolean;
}

// Forma mínima que a função de escalação precisa de um lembrete.
export interface ReminderEscalationInput {
  status: ReminderStatus;
  created_at: string;
  due_date: string | null;
  assignee_role: AppRole | null;
}

export function computeEscalation(
  r: ReminderEscalationInput,
  now: Date = new Date()
): ReminderEscalation {
  const anchor = r.due_date ?? r.created_at;
  const age = ageDays(anchor, now);

  // Concluído ou sem responsável identificável -> sem escalação (mas mantém age
  // pro display "Xd").
  if (r.status !== "open" || !r.assignee_role) {
    return { ageDays: age, escalatedToManager: false, escalatedToOwner: false };
  }

  let toManager = false;
  let toOwner = false;

  if (BELOW_MANAGER.includes(r.assignee_role)) {
    toManager = age >= 3;
    toOwner = age >= 5;
  } else if (r.assignee_role === "manager") {
    // Pula o passo do manager: vai direto pro owner em 3 dias.
    toOwner = age >= 3;
  }
  // assignee owner: nada escala.

  return { ageDays: age, escalatedToManager: toManager, escalatedToOwner: toOwner };
}

// Contagem do badge pro usuário logado: owner vê as escalações de owner,
// manager vê as de manager, os demais não recebem escalação (badge 0).
export function badgeCountForViewer(
  viewerRole: AppRole,
  escalations: ReminderEscalation[]
): number {
  if (viewerRole === "owner") {
    return escalations.filter((e) => e.escalatedToOwner).length;
  }
  if (viewerRole === "manager") {
    return escalations.filter((e) => e.escalatedToManager).length;
  }
  return 0;
}

// Uma escalação "conta" pro usuário logado? (usado nos filtros/summary).
export function isEscalatedToViewer(
  viewerRole: AppRole,
  e: ReminderEscalation
): boolean {
  if (viewerRole === "owner") return e.escalatedToOwner;
  if (viewerRole === "manager") return e.escalatedToManager;
  return false;
}
