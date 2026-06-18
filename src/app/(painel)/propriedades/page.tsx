import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, Badge, buttonClass, Card } from "@/components/ui";
import { PROPERTY_TYPE_LABEL, type Property, type PropertyType } from "@/lib/types";
import { money } from "@/lib/format";
import { Home, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PropertyRow = Property & { owner: { id: string; name: string } | null };

async function load(typeFilter?: string) {
  try {
    const supabase = createClient();
    let q = supabase
      .from("properties")
      .select("*, owner:owner_id (id, name)")
      .is("archived_at", null)
      .order("address", { ascending: true });
    if (typeFilter) q = q.eq("property_type", typeFilter);
    const { data, error } = await q;
    if (error) throw error;
    return { ok: true as const, properties: (data ?? []) as unknown as PropertyRow[] };
  } catch {
    return { ok: false as const, properties: [] as PropertyRow[] };
  }
}

const FILTERS = [
  { value: "", label: "Todas" },
  ...Object.entries(PROPERTY_TYPE_LABEL).map(([value, label]) => ({ value, label })),
];

function toneFor(t: PropertyType): "gold" | "orange" | "neutral" {
  if (t === "vacation_rental") return "orange";
  if (t === "for_sale") return "gold";
  return "neutral";
}

export default async function PropriedadesPage({ searchParams }: { searchParams: { tipo?: string } }) {
  const active = searchParams.tipo ?? "";
  const { ok, properties } = await load(active || undefined);

  return (
    <>
      <PageHeader
        title="Propriedades"
        subtitle="Toda propriedade tem um owner. Cadastre pela ficha do cliente."
        action={
          <Link href="/clientes" className={buttonClass("ghost")}>
            <Plus className="h-4 w-4" /> Via cliente
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive = active === f.value;
          return (
            <Link
              key={f.value || "all"}
              href={f.value ? `/propriedades?tipo=${f.value}` : "/propriedades"}
              className={
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition " +
                (isActive
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-black/10 bg-white text-ink/60 hover:text-ink hover:border-black/20")
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {!ok && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06] text-sm text-ink/70">
          Banco não conectado. Confira as variáveis de ambiente{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
          <code className="text-primary">SUPABASE_SERVICE_ROLE_KEY</code>.
        </Card>
      )}

      {properties.length === 0 ? (
        <EmptyState
          icon={<Home className="h-6 w-6" />}
          title="Nenhuma propriedade"
          message="Propriedade nasce pendurada num cliente. Abra um cliente e cadastre a casa dele."
          cta={
            <Link href="/clientes" className={buttonClass("primary")}>
              Ir para Clientes
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-5 py-3 font-bold">Endereço</th>
                <th className="px-5 py-3 font-bold">Tipo</th>
                <th className="px-5 py-3 font-bold">Owner</th>
                <th className="px-5 py-3 font-bold">Aluguel</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {properties.map((p, i) => (
                <tr
                  key={p.id}
                  className={
                    "border-t border-black/[0.05] transition hover:bg-primary/[0.04] " +
                    (i % 2 === 1 ? "bg-black/[0.015]" : "")
                  }
                >
                  <td className="px-5 py-3.5">
                    <Link href={`/propriedades/${p.id}`} className="font-semibold text-ink hover:text-primary">
                      {p.address}
                    </Link>
                    {p.address2 && <span className="block text-xs text-ink/45">{p.address2}</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={toneFor(p.property_type)}>{PROPERTY_TYPE_LABEL[p.property_type]}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-ink/65">
                    {p.owner ? (
                      <Link href={`/clientes/${p.owner.id}`} className="hover:text-primary">{p.owner.name}</Link>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-ink/70">{money(p.rent_price)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <Link href={`/propriedades/${p.id}`} className="inline-flex text-ink/40 hover:text-primary">
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
