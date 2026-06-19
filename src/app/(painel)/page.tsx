import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Badge } from "@/components/ui";
import { Users, Home, FileText, AlertTriangle, Lock } from "lucide-react";

export const dynamic = "force-dynamic";

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
  const c = await getCounts();
  const denied = typeof searchParams.denied === "string" ? searchParams.denied : null;

  const cards = [
    { label: "Active clients", value: c.clients, icon: Users, tone: "gold" as const },
    { label: "Active properties", value: c.properties, icon: Home, tone: "orange" as const },
    { label: "Invoices", value: c.invoices, icon: FileText, tone: "neutral" as const },
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="By the C Realty & Property Management · Cape Cod, MA"
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
