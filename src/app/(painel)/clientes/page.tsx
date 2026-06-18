import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, Badge, buttonClass, Card } from "@/components/ui";
import { CLIENT_TYPE_LABEL, type Client, type ClientType } from "@/lib/types";
import { Users, Plus, ChevronRight } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function load(typeFilter?: string) {
  try {
    const supabase = createClient();
    let q = supabase
      .from("clients")
      .select("*")
      .is("archived_at", null) // TRAVADO: lista filtra arquivados por padrão
      .order("name", { ascending: true });
    if (typeFilter) q = q.eq("client_type", typeFilter);
    const { data, error } = await q;
    if (error) throw error;
    return { ok: true as const, clients: (data ?? []) as Client[] };
  } catch {
    return { ok: false as const, clients: [] as Client[] };
  }
}

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Todos" },
  ...Object.entries(CLIENT_TYPE_LABEL).map(([value, label]) => ({ value, label })),
];

function toneFor(t: ClientType): "gold" | "orange" | "neutral" {
  if (t === "airbnb_owner") return "orange";
  if (t === "landlord") return "gold";
  return "neutral";
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: { tipo?: string };
}) {
  const active = searchParams.tipo ?? "";
  const { ok, clients } = await load(active || undefined);

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Entidade-mãe. A propriedade pendura no cliente."
        action={
          <Link href="/clientes/novo" className={buttonClass("primary")}>
            <Plus className="h-4 w-4" /> Novo cliente
          </Link>
        }
      />

      {/* Filtro por tipo (chips) */}
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive = active === f.value;
          return (
            <Link
              key={f.value || "all"}
              href={f.value ? `/clientes?tipo=${f.value}` : "/clientes"}
              className={
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition " +
                (isActive
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white/90")
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {!ok && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06] text-sm text-white/70">
          Banco não conectado. Confira as variáveis de ambiente{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
          <code className="text-primary">SUPABASE_SERVICE_ROLE_KEY</code>.
        </Card>
      )}

      {clients.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Nenhum cliente ainda"
          message="Cadastre o primeiro cliente. A propriedade vem depois, pendurada nele."
          cta={
            <Link href="/clientes/novo" className={buttonClass("primary")}>
              <Plus className="h-4 w-4" /> Novo cliente
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-5 py-3 font-bold">Nome</th>
                <th className="px-5 py-3 font-bold">Tipo</th>
                <th className="px-5 py-3 font-bold">Contato</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {clients.map((c, i) => (
                <tr
                  key={c.id}
                  className={
                    "border-t border-white/[0.05] transition hover:bg-white/[0.04] " +
                    (i % 2 === 1 ? "bg-white/[0.02]" : "")
                  }
                >
                  <td className="px-5 py-3.5">
                    <Link href={`/clientes/${c.id}`} className="font-semibold text-white hover:text-primary">
                      {c.name}
                    </Link>
                    {c.co_client_name && (
                      <span className="block text-xs text-white/40">& {c.co_client_name}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={toneFor(c.client_type)}>{CLIENT_TYPE_LABEL[c.client_type]}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-white/60">
                    {c.email ?? "—"}
                    {c.phone && <span className="block text-xs text-white/40">{c.phone}</span>}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link href={`/clientes/${c.id}`} className="inline-flex text-white/40 hover:text-primary">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
