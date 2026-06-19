"use client";

// Tabela de clientes com busca instantânea por nome (primeiro + último).
// A lista já chega ORDENADA por nome (primeiro nome, A→Z) do servidor.
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { CLIENT_TYPE_LABEL, type Client, type ClientType } from "@/lib/types";

function toneFor(t: ClientType): "gold" | "orange" | "neutral" {
  if (t === "airbnb_owner") return "orange";
  if (t === "landlord") return "gold";
  return "neutral";
}

export function ClientsTable({
  clients,
  initialQuery = "",
}: {
  clients: Client[];
  initialQuery?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  // Mantém a busca na URL (sem refetch) pra o "Back to clients" do detalhe restaurar a busca.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url.toString());
  }, [query]);

  const term = query.trim().toLowerCase();
  const filtered = term
    ? clients.filter((c) => {
        const hay = `${c.name ?? ""} ${c.co_client_name ?? ""}`.toLowerCase();
        // casa qualquer palavra digitada (primeiro nome, sobrenome, ou os dois)
        return term.split(/\s+/).every((word) => hay.includes(word));
      })
    : clients;

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
          No clients match “{query}”.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-5 py-3 font-bold">Name</th>
                <th className="px-5 py-3 font-bold">Type</th>
                <th className="px-5 py-3 font-bold">Contact</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/clientes/${c.id}`)}
                  className={
                    "cursor-pointer border-t border-black/[0.05] transition hover:bg-primary/[0.04] " +
                    (i % 2 === 1 ? "bg-black/[0.015]" : "")
                  }
                >
                  <td className="px-5 py-3.5">
                    <Link href={`/clientes/${c.id}`} className="font-semibold text-ink hover:text-primary">
                      {c.name}
                    </Link>
                    {c.co_client_name && (
                      <span className="block text-xs text-ink/45">&amp; {c.co_client_name}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={toneFor(c.client_type)}>{CLIENT_TYPE_LABEL[c.client_type]}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-ink/65">
                    {c.email ?? "—"}
                    {c.phone && <span className="block text-xs text-ink/45">{c.phone}</span>}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link href={`/clientes/${c.id}`} className="inline-flex text-ink/40 hover:text-primary">
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
