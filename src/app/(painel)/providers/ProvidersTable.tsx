"use client";

// Tabela de service providers com busca instantânea por nome.
// Mesmo padrão visual de ClientsTable (alternating rows, hover, header bold).
import { useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui";
import { NOTIFY_VIA_LABEL, type ServiceProvider } from "@/lib/types";

export function ProvidersTable({ providers }: { providers: ServiceProvider[] }) {
  const [query, setQuery] = useState("");

  const term = query.trim().toLowerCase();
  const filtered = term
    ? providers.filter((p) => {
        const hay = `${p.name ?? ""} ${p.service_type ?? ""}`.toLowerCase();
        return term.split(/\s+/).every((word) => hay.includes(word));
      })
    : providers;

  return (
    <>
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-10 text-center text-sm text-ink/55 shadow-card">
          No providers match “{query}”.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-5 py-3 font-bold">Name</th>
                <th className="px-5 py-3 font-bold">Service</th>
                <th className="px-5 py-3 font-bold">Contact</th>
                <th className="px-5 py-3 font-bold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr
                  key={p.id}
                  className={
                    "border-t border-black/[0.05] transition hover:bg-primary/[0.04] " +
                    (i % 2 === 1 ? "bg-black/[0.015]" : "")
                  }
                >
                  <td className="px-5 py-3.5 font-semibold text-ink">{p.name}</td>
                  <td className="px-5 py-3.5">
                    {p.service_type ? (
                      <Badge tone="orange">{p.service_type}</Badge>
                    ) : (
                      <span className="text-ink/40">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-ink/65">
                    {p.phone ?? p.email ?? "—"}
                    {p.phone && p.email && (
                      <span className="block text-xs text-ink/45">{p.email}</span>
                    )}
                    {p.notify_via && (
                      <span className="mt-1 block text-[11px] text-ink/40">
                        Notify via {NOTIFY_VIA_LABEL[p.notify_via]}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-ink/55">
                    {p.notes ? (
                      <span className="line-clamp-2 max-w-xs">{p.notes}</span>
                    ) : (
                      <span className="text-ink/35">—</span>
                    )}
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
