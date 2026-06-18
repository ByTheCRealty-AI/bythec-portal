import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Badge } from "@/components/ui";
import { Users, Home, FileText, AlertTriangle } from "lucide-react";

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

export default async function OverviewPage() {
  const c = await getCounts();

  const cards = [
    { label: "Clientes ativos", value: c.clients, icon: Users, tone: "gold" as const },
    { label: "Propriedades ativas", value: c.properties, icon: Home, tone: "orange" as const },
    { label: "Invoices", value: c.invoices, icon: FileText, tone: "neutral" as const },
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="By the C Realty & Property Management · Cape Cod, MA"
      />

      {!c.ok && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
            <div className="text-sm text-white/70">
              <p className="font-semibold text-white">Banco não conectado</p>
              <p className="mt-1">
                Confira as variáveis de ambiente{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-primary">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-primary">SUPABASE_SERVICE_ROLE_KEY</code>.
                Os números aparecem assim que o Postgres responder.
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
                <Icon className="h-5 w-5 text-white/40" />
              </div>
              <p className="mt-5 h-display text-4xl text-white">{card.value}</p>
              <p className="mt-1 text-sm text-white/50">{card.label}</p>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <h2 className="h-display text-lg text-white">Onda 2 — esta rodada</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/55">
          Fundação do sistema próprio que substitui o Bubble. Schema completo (núcleo, finanças,
          operação) modelado em SQL com as regras travadas. Módulos <strong className="text-white/80">Clientes</strong> e{" "}
          <strong className="text-white/80">Propriedades</strong> funcionais — criar, ver, editar e arquivar
          (nunca deletar). Os demais módulos seguem nas próximas rodadas.
        </p>
      </Card>
    </>
  );
}
