import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Badge } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can, type AppRole } from "@/lib/auth/capabilities";
import {
  computeEscalation,
  isEscalatedToViewer,
  badgeCountForViewer,
  type ReminderEscalation,
} from "@/lib/reminders";
import type { ReminderStatus } from "@/lib/types";
import {
  Users,
  Home,
  FileText,
  AlertTriangle,
  Lock,
  BellRing,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

type SummaryRow = {
  id: string;
  title: string;
  assignee_name: string | null;
  assigned_to: string;
  esc: ReminderEscalation;
};

// Resumo de lembretes pro card do Overview: quantos abertos são MEUS, quantos
// estão escalados PRA MIM, e os mais urgentes pra listar. Falha silenciosa se a
// tabela ainda não existe.
async function loadRemindersSummary(viewerId: string, role: AppRole) {
  try {
    const supabase = createClient();
    const [{ data: rems }, { data: people }] = await Promise.all([
      supabase
        .from("reminders")
        .select("id, title, status, created_at, due_date, assigned_to")
        .eq("status", "open")
        .is("archived_at", null),
      supabase.rpc("reminder_people"),
    ]);
    const dir = new Map(
      ((people ?? []) as Array<{ id: string; full_name: string | null; role: AppRole }>).map(
        (p) => [p.id, p]
      )
    );
    const rows: SummaryRow[] = ((rems ?? []) as Array<{
      id: string;
      title: string;
      status: ReminderStatus;
      created_at: string;
      due_date: string | null;
      assigned_to: string;
    }>).map((r) => ({
      id: r.id,
      title: r.title,
      assigned_to: r.assigned_to,
      assignee_name: dir.get(r.assigned_to)?.full_name ?? null,
      esc: computeEscalation({
        status: r.status,
        created_at: r.created_at,
        due_date: r.due_date,
        assignee_role: dir.get(r.assigned_to)?.role ?? null,
      }),
    }));

    const myOpen = rows.filter((r) => r.assigned_to === viewerId);
    const escalatedToMe = rows.filter((r) => isEscalatedToViewer(role, r.esc));
    const badge = badgeCountForViewer(role, rows.map((r) => r.esc));

    // Mais urgentes primeiro: escalados pra mim no topo, depois meus abertos por
    // idade. Dedup por id.
    const seen = new Set<string>();
    const top: SummaryRow[] = [];
    for (const r of [...escalatedToMe, ...myOpen].sort((a, b) => b.esc.ageDays - a.esc.ageDays)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      top.push(r);
      if (top.length >= 3) break;
    }

    return {
      ok: true as const,
      myOpen: myOpen.length,
      escalatedToMe: escalatedToMe.length,
      badge,
      top,
    };
  } catch {
    return { ok: false as const, myOpen: 0, escalatedToMe: 0, badge: 0, top: [] as SummaryRow[] };
  }
}

async function getCounts() {
  try {
    const supabase = createClient();
    const [clients, properties, invoices] = await Promise.all([
      supabase.from("clients").select("*", { count: "exact", head: true }).is("archived_at", null),
      supabase.from("properties").select("*", { count: "exact", head: true }).is("archived_at", null),
      supabase.from("invoices").select("*", { count: "exact", head: true }).is("archived_at", null),
    ]);
    if (clients.error) throw clients.error;
    return {
      ok: true as const,
      clients: clients.count ?? 0,
      properties: properties.count ?? 0,
      invoices: invoices.count ?? 0,
    };
  } catch {
    return { ok: false as const, clients: 0, properties: 0, invoices: 0 };
  }
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: { denied?: string };
}) {
  const [c, profile] = await Promise.all([getCounts(), getProfile()]);
  const denied = typeof searchParams.denied === "string" ? searchParams.denied : null;

  const showReminders = !!profile && can(profile, "reminders.view");
  const reminders = showReminders
    ? await loadRemindersSummary(profile!.id, profile!.role)
    : null;

  // Counts vêm via RLS → pro realtor, clients/properties já são só os DELE ("her
  // things"). O card de Invoices só faz sentido pra quem tem acesso a invoices.
  const canSeeInvoices =
    can(profile, "invoices.service") || can(profile, "invoices.seasonal") || can(profile, "financials.full");
  const cards = [
    { label: "Active clients", value: c.clients, icon: Users, tone: "gold" as const },
    { label: "Active properties", value: c.properties, icon: Home, tone: "orange" as const },
    ...(canSeeInvoices
      ? [{ label: "Invoices", value: c.invoices, icon: FileText, tone: "neutral" as const }]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="By the C Realty and Property Management · Cape Cod, MA"
      />

      {denied && (
        <Card className="mb-6 border-black/[0.1] bg-black/[0.02]">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-ink/45" />
            <div className="text-sm text-ink/70">
              <p className="font-semibold text-ink">No access to that section</p>
              <p className="mt-1">You do not have permission to open it. Ask an administrator if you need it.</p>
            </div>
          </div>
        </Card>
      )}

      {!c.ok && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
            <div className="text-sm text-ink/70">
              <p className="font-semibold text-ink">Database not connected</p>
              <p className="mt-1">
                Check the environment variables{" "}
                <code className="rounded bg-black/[0.05] px-1.5 py-0.5 text-primary">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="rounded bg-black/[0.05] px-1.5 py-0.5 text-primary">SUPABASE_SERVICE_ROLE_KEY</code>.
                The numbers appear as soon as Postgres responds.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="glass-hover">
              <div className="flex items-center justify-between">
                <Badge tone={card.tone}>By the C</Badge>
                <Icon className="h-5 w-5 text-primary/60" />
              </div>
              <p className="mt-5 h-display text-4xl text-ink">{card.value}</p>
              <p className="mt-1 text-sm text-ink/55">{card.label}</p>
            </Card>
          );
        })}
      </div>

      {reminders && (
        <Card className="mt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <BellRing className="h-5 w-5" />
              </span>
              <div>
                <h2 className="h-display text-lg text-ink">Reminders</h2>
                <p className="text-xs text-ink/50">Your open follow-ups</p>
              </div>
            </div>
            <Link
              href="/reminders"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition hover:gap-1.5"
            >
              Open board <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-sm">
            <div className="rounded-xl border border-black/[0.07] bg-black/[0.015] px-4 py-3">
              <p className="h-display text-2xl text-ink">{reminders.myOpen}</p>
              <p className="text-xs text-ink/55">Assigned to me · open</p>
            </div>
            <div
              className={
                reminders.escalatedToMe > 0
                  ? "rounded-xl border border-red-200 bg-red-50 px-4 py-3"
                  : "rounded-xl border border-black/[0.07] bg-black/[0.015] px-4 py-3"
              }
            >
              <p
                className={
                  reminders.escalatedToMe > 0
                    ? "h-display text-2xl text-red-600"
                    : "h-display text-2xl text-ink"
                }
              >
                {reminders.escalatedToMe}
              </p>
              <p className="text-xs text-ink/55">Escalated to me</p>
            </div>
          </div>

          {reminders.top.length > 0 ? (
            <ul className="mt-4 space-y-1.5">
              {reminders.top.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-black/[0.06] bg-white px-3.5 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-ink/80">{r.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {r.esc.escalatedToOwner ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                        <ShieldAlert className="h-3 w-3" /> Owner
                      </span>
                    ) : r.esc.escalatedToManager ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                        <BellRing className="h-3 w-3" /> Manager
                      </span>
                    ) : null}
                    <span className="text-xs text-ink/45">{r.esc.ageDays}d</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink/50">Nothing open assigned to you. Nice.</p>
          )}
        </Card>
      )}

      <Card className="mt-6">
        <h2 className="h-display text-lg text-ink">Wave 2 — this round</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink/65">
          Foundation of the in-house system that replaces Bubble. Full schema (core, finance,
          operations) modeled in SQL with the locked rules. The <strong className="text-ink">Clients</strong> and{" "}
          <strong className="text-ink">Properties</strong> modules are functional — create, view, edit and archive
          (never delete). The remaining modules follow in the next rounds.
        </p>
      </Card>
    </>
  );
}
