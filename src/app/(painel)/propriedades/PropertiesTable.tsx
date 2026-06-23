"use client";

// Tabela de propriedades com busca instantânea por endereço + nome do owner.
// A lista já chega ORDENADA por endereço (A→Z) do servidor.
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { money } from "@/lib/format";
import { PROPERTY_TYPE_LABEL, type Property, type PropertyType } from "@/lib/types";

type PropertyRow = Property & { owner: { id: string; name: string } | null };

function toneFor(t: PropertyType): "gold" | "orange" | "neutral" {
  if (t === "vacation_rental") return "orange";
  if (t === "for_sale") return "gold";
  return "neutral";
}

export function PropertiesTable({
  properties,
  initialQuery = "",
}: {
  properties: PropertyRow[];
  initialQuery?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  // Mantém a busca na URL (sem refetch) pra o "Back to properties" do detalhe
  // restaurar a busca.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url.toString());
  }, [query]);

  const term = query.trim().toLowerCase();
  const filtered = term
    ? properties.filter((p) => {
        const hay = `${p.address ?? ""} ${p.address2 ?? ""} ${p.owner?.name ?? ""}`.toLowerCase();
        // casa qualquer palavra digitada (endereço, unidade, ou nome do owner)
        return term.split(/\s+/).every((word) => hay.includes(word));
      })
    : properties;

  return (
    <>
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by address or owner…"
          className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-10 text-center text-sm text-ink/55 shadow-card">
          No properties match “{query}”.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-5 py-3 font-bold">Address</th>
                <th className="px-5 py-3 font-bold">Type</th>
                <th className="px-5 py-3 font-bold">Owner</th>
                <th className="px-5 py-3 font-bold">Rent</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr
                  key={p.id}
                  onClick={() => {
                    // Snapshot da lista (tipo + busca) pra o "Back to properties" restaurar.
                    try {
                      sessionStorage.setItem(
                        "bythec:properties-return",
                        "/propriedades" + window.location.search
                      );
                    } catch {
                      /* noop */
                    }
                    router.push(`/propriedades/${p.id}`);
                  }}
                  className={
                    "cursor-pointer border-t border-black/[0.05] transition hover:bg-primary/[0.04] " +
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
                      <Link
                        href={`/clientes/${p.owner.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-primary"
                      >
                        {p.owner.name}
                      </Link>
                    ) : (
                      "—"
                    )}
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
