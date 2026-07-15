"use client";

// Tabela GLOBAL de serviços (todas as propriedades): filtro por status
// (All / Active / Done) + busca instantânea por propriedade, prestador ou
// descrição. Read-only aqui — editar/criar continua na aba Services da propriedade.
import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { money, date, cx } from "@/lib/format";
import type { RequestStatus } from "@/lib/types";

export interface ServiceListRow {
  id: string;
  date: string | null;
  property_id: string;
  property_address: string | null;
  property_address2: string | null;
  provider_name: string | null;
  description: string | null;
  status: RequestStatus;
  done_at: string | null;
  price: number | null;
}

type Filter = "" | "open" | "done";

function StatusBadge({ status }: { status: RequestStatus }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
        Done
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-secondary/25 bg-secondary/10 px-2.5 py-0.5 text-xs font-semibold text-secondary">
      Active
    </span>
  );
}

export function ServicesTable({ rows }: { rows: ServiceListRow[] }) {
  const [filter, setFilter] = useState<Filter>("");
  const [query, setQuery] = useState("");

  const chips: Array<{ value: Filter; label: string }> = [
    { value: "", label: "All" },
    { value: "open", label: "Active" },
    { value: "done", label: "Done" },
  ];

  const activeCount = rows.filter((r) => r.status === "open").length;
  const doneCount = rows.filter((r) => r.status === "done").length;

  const term = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (filter && r.status !== filter) return false;
    if (term) {
      const hay = `${r.property_address ?? ""} ${r.provider_name ?? ""} ${r.description ?? ""}`.toLowerCase();
      return term.split(/\s+/).every((w) => hay.includes(w));
    }
    return true;
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chips.map((c) => {
          const active = filter === c.value;
          const count = c.value === "open" ? activeCount : c.value === "done" ? doneCount : rows.length;
          return (
            <button
              key={c.value || "all"}
              onClick={() => setFilter(c.value)}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-black/10 bg-white text-ink/60 hover:text-ink hover:border-black/20"
              )}
            >
              {c.label}
              <span className="rounded-full bg-black/[0.06] px-1.5 text-[10px] font-bold text-ink/55">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search property, provider or description…"
          className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-10 text-center text-sm text-ink/55 shadow-card">
          No services match the current filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-5 py-3 font-bold">Date</th>
                <th className="px-5 py-3 font-bold">Property</th>
                <th className="px-5 py-3 font-bold">Provider</th>
                <th className="px-5 py-3 font-bold">Description</th>
                <th className="px-5 py-3 font-bold">Price</th>
                <th className="px-5 py-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.id}
                  className={cx(
                    "border-t border-black/[0.05] transition hover:bg-primary/[0.04]",
                    i % 2 === 1 && "bg-black/[0.015]"
                  )}
                >
                  <td className="whitespace-nowrap px-5 py-3.5 text-ink/65">
                    {r.status === "done" ? date(r.done_at ?? r.date) : date(r.date)}
                  </td>
                  <td className="px-5 py-3.5">
                    {r.property_address ? (
                      <Link
                        href={`/propriedades/${r.property_id}`}
                        className="font-semibold text-ink hover:text-primary"
                      >
                        {r.property_address}
                      </Link>
                    ) : (
                      <span className="text-ink/35">—</span>
                    )}
                    {r.property_address2 && (
                      <span className="block text-xs text-ink/45">{r.property_address2}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-ink/70">{r.provider_name ?? <span className="text-ink/35">—</span>}</td>
                  <td className="px-5 py-3.5 text-ink/65">
                    {r.description ? (
                      <span className="line-clamp-2 max-w-md">{r.description}</span>
                    ) : (
                      <span className="text-ink/35">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-ink/85">
                    {r.price != null ? money(r.price) : <span className="text-ink/35">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={r.status} />
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
