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
import { LeaseRenewalsCard, type RenewalItem } from "./LeaseRenewalsCard";
import { OwnerOwesCard, type OwnerOweItem } from "./OwnerOwesCard";
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

// Lease renewals pro Overview: leases (year-round/off-season) terminando nos
// próximos 90 dias, mais próximos no topo. Split entre ativos e descartados
// (renewal_dismissed_for = rental_end). Falha silenciosa se algo faltar.
async function loadLeaseRenewals() {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("properties")
      .select(
        "id, address, address2, rental_end, renewal_dismissed_for, tenant:tenant_id(name)"
      )
      .or("is_year_round.eq.true,is_winter.eq.true")
      .is("archived_at", null)
      .not("rental_end", "is", null)
      .lte("rental_end", new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10))
      .gte("rental_end", new Date().toISOString().slice(0, 10))
      .order("rental_end", { ascending: true });

    const todayUTC = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
    const rows = ((data ?? []) as unknown as Array<{
      id: string;
      address: string;
      address2: string | null;
      rental_end: string;
      renewal_dismissed_for: string | null;
      tenant: { name: string } | null;
    }>).map((r) => {
      const endT = new Date(r.rental_end + "T00:00:00Z");
      const item: RenewalItem = {
        id: r.id,
        label: r.address.split(",")[0].trim(), // só a rua
        unit: r.address2,
        tenant: r.tenant?.name ?? null,
        days: Math.max(0, Math.round((endT.getTime() - todayUTC) / 864e5)),
        endLabel: endT.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      };
      return { item, dismissed: r.renewal_dismissed_for === r.rental_end };
    });

    return {
      active: rows.filter((r) => !r.dismissed).map((r) => r.item),
      dismissed: rows.filter((r) => r.dismissed).map((r) => r.item),
    };
  } catch {
    return { active: [] as RenewalItem[], dismissed: [] as RenewalItem[] };
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

// Invoices de serviço/geral ainda não pagas, com mais de 7 dias. Idade conta do
// sent_at; sem sent_at, da data da invoice (decisão da Andrea 2026-09-25).
async function getOwnerOwes(
  profile: Awaited<ReturnType<typeof getProfile>>
): Promise<OwnerOweItem[]> {
  if (!can(profile, "financials.full") && !can(profile, "invoices.service")) return [];
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, kind, date, sent_at, sent_to_owner, labor_total, material_total, general_total, client:client_id(name), property:property_id(address, address2, rent_collection), items:invoice_items(category, total), payments:invoice_payments(amount)"
      )
      .eq("paid", false)
      .is("archived_at", null)
      .in("kind", ["service", "general"]);

    type Row = {
      id: string;
      invoice_number: number | null;
      kind: string;
      date: string | null;
      sent_at: string | null;
      sent_to_owner: boolean | null;
      labor_total: number | null;
      material_total: number | null;
      general_total: number | null;
      client: { name: string | null } | null;
      property: { address: string | null; address2: string | null; rent_collection: string | null } | null;
      items: { category: string | null; total: number }[] | null;
      payments: { amount: number }[] | null;
    };

    const today = new Date();
    const out: OwnerOweItem[] = [];
    for (const r of (data ?? []) as unknown as Row[]) {
      const anchor = r.sent_at ?? r.date;
      if (!anchor) continue;
      const days = Math.floor((today.getTime() - new Date(`${anchor}T12:00:00Z`).getTime()) / 86_400_000);
      if (days <= 7) continue;

      const credits = (r.items ?? [])
        .filter((i) => i.category === "credit")
        .reduce((a, i) => a + Math.abs(Number(i.total) || 0), 0);
      const billed =
        r.kind === "general"
          ? Number(r.general_total ?? 0)
          : Number(r.labor_total ?? 0) + Number(r.material_total ?? 0) - credits;
      const paid = (r.payments ?? []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
      const owed = Math.round((billed - paid) * 100) / 100;
      if (owed <= 0) continue;

      out.push({
        id: r.id,
        invoiceNumber: r.invoice_number,
        owner: r.client?.name ?? "Unknown owner",
        property: (r.property?.address ?? "").split(",")[0] || "—",
        unit: r.property?.address2 ?? null,
        owed,
        days,
        sent: !!r.sent_to_owner,
        canDeduct: r.property?.rent_collection === "bythec",
        partiallyPaid: paid > 0 || credits > 0,
      });
    }
    out.sort((a, b) => b.owed - a.owed);
    return out;
  } catch {
    return [];
  }
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: { denied?: string };
}) {
  const [c, profile] = await Promise.all([getCounts(), getProfile()]);
  const ownerOwes = await getOwnerOwes(profile);
  const denied = typeof searchParams.denied === "string" ? searchParams.denied : null;

  const showReminders = !!profile && can(profile, "reminders.view");
  const reminders = showReminders
    ? await loadRemindersSummary(profile!.id, profile!.role)
    : null;

  // Lease renewals: só pra internos (owner/manager/secretary — têm properties.edit).
  const canManageLeases = can(profile, "properties.edit");
  const renewals = canManageLeases ? await loadLeaseRenewals() : null;

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

      {ownerOwes.length > 0 && <OwnerOwesCard items={ownerOwes} />}

      {renewals && (renewals.active.length > 0 || renewals.dismissed.length > 0) && (
        <LeaseRenewalsCard
          active={renewals.active}
          dismissed={renewals.dismissed}
          canManage={canManageLeases}
        />
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
