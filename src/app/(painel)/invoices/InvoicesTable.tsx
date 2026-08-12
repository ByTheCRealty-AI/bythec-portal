"use client";

// Tabela de invoices: filtro por chips (All / Seasonal / Service / Unpaid) +
// busca instantânea (cliente / propriedade / número). Linha inteira clicável.
// Mesmo padrão de ClientsTable (sessionStorage pra restaurar o "Back").
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { date, cx } from "@/lib/format";
import { INVOICE_KIND_LABEL, type InvoiceKind } from "@/lib/types";

export interface InvoiceRow {
  id: string;
  invoice_number: number;
  kind: InvoiceKind;
  platform: string | null;
  date: string;
  paid: boolean;
  total: number;
  client_name: string | null;
  property_address: string | null;
  cleaner_unpaid: boolean;
  // Estados do service (null em seasonal).
  sent: boolean | null;
  labor_paid: boolean | null;
  material_paid: boolean | null;
  commission_collected: boolean | null;
}

type Filter =
  | ""
  | "seasonal"
  | "service"
  | "unpaid"
  | "cleaner_unpaid"
  | "owner_owes"
  | "worker_to_pay"
  | "commission_due";

export function InvoicesTable({
  rows,
  canSeasonal,
  scope = "all",
  initialFilter = "",
  initialQuery = "",
}: {
  rows: InvoiceRow[];
  canSeasonal: boolean;
  // Escopo da sub-categoria: quando não é "all", as linhas já vêm de um único tipo,
  // então escondemos os chips de tipo e mostramos só os de status relevantes.
  scope?: "all" | "seasonal" | "service";
  initialFilter?: string;
  initialQuery?: string;
}) {
  const router = useRouter();
  // Num escopo (service/seasonal) os filtros de TIPO não fazem sentido — ignora
  // um ?filter=seasonal/service herdado da URL pra não zerar a lista.
  const sanitizedInitial =
    scope !== "all" && (initialFilter === "seasonal" || initialFilter === "service")
      ? ""
      : initialFilter;
  const [filter, setFilter] = useState<Filter>((sanitizedInitial as Filter) || "");
  const [query, setQuery] = useState(initialQuery);

  // Mantém filtro + busca na URL pra o "Back to invoices" restaurar o estado.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (filter) url.searchParams.set("filter", filter);
    else url.searchParams.delete("filter");
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url.toString());
  }, [filter, query]);

  const chips: Array<{ value: Filter; label: string }> =
    scope === "seasonal"
      ? [
          { value: "", label: "All" },
          { value: "unpaid", label: "Unpaid" },
          { value: "cleaner_unpaid", label: "Cleaner unpaid" },
        ]
      : scope === "service"
      ? [
          { value: "", label: "All" },
          { value: "unpaid", label: "Unpaid" },
          { value: "owner_owes", label: "Owner owes" },
          { value: "worker_to_pay", label: "Worker to pay" },
          { value: "commission_due", label: "Commission due" },
        ]
      : [
          // "all" — tudo junto, com filtros de tipo E de status.
          { value: "", label: "All" },
          ...(canSeasonal ? [{ value: "seasonal" as Filter, label: "Seasonal" }] : []),
          { value: "service", label: "Service" },
          { value: "unpaid", label: "Unpaid" },
          ...(canSeasonal ? [{ value: "cleaner_unpaid" as Filter, label: "Cleaner unpaid" }] : []),
          { value: "owner_owes", label: "Owner owes" },
          { value: "worker_to_pay", label: "Worker to pay" },
          { value: "commission_due", label: "Commission due" },
        ];

  const term = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (filter === "seasonal" && r.kind !== "seasonal") return false;
    if (filter === "service" && r.kind !== "service") return false;
    if (filter === "unpaid" && r.paid) return false;
    if (filter === "cleaner_unpaid" && !r.cleaner_unpaid) return false;
    // Filtros de service: só batem em service que ainda tem pendência no eixo.
    if (filter === "owner_owes" && !(r.kind === "service" && !r.paid)) return false;
    if (filter === "worker_to_pay" && !(r.kind === "service" && (!r.labor_paid || !r.material_paid))) return false;
    if (filter === "commission_due" && !(r.kind === "service" && !r.commission_collected)) return false;
    if (term) {
      const hay = `${r.client_name ?? ""} ${r.property_address ?? ""} ${r.invoice_number}`.toLowerCase();
      return term.split(/\s+/).every((w) => hay.includes(w));
    }
    return true;
  });

  function go(id: string) {
    try {
      sessionStorage.setItem("bythec:invoices-return", window.location.pathname + window.location.search);
    } catch {
      /* noop */
    }
    router.push(`/invoices/${id}`);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chips.map((c) => {
          const active = filter === c.value;
          return (
            <button
              key={c.value || "all"}
              onClick={() => setFilter(c.value)}
              className={cx(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-black/10 bg-white text-ink/60 hover:text-ink hover:border-black/20"
              )}
            >
              {c.label}
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
          placeholder="Search client, property or number…"
          className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-10 text-center text-sm text-ink/55 shadow-card">
          No invoices match the current filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-5 py-3 font-bold">#</th>
                <th className="px-5 py-3 font-bold">Type</th>
                <th className="px-5 py-3 font-bold">Client</th>
                <th className="px-5 py-3 font-bold">Property</th>
                <th className="px-5 py-3 font-bold">Date</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => go(r.id)}
                  className={cx(
                    "cursor-pointer border-t border-black/[0.05] transition hover:bg-primary/[0.04]",
                    i % 2 === 1 && "bg-black/[0.015]"
                  )}
                >
                  <td className="px-5 py-3.5 font-semibold text-ink">{r.invoice_number}</td>
                  <td className="px-5 py-3.5">
                    <Badge tone={r.kind === "seasonal" ? "orange" : "gold"}>
                      {INVOICE_KIND_LABEL[r.kind]}
                      {r.kind === "seasonal" && r.platform ? ` · ${r.platform}` : ""}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-ink/85">{r.client_name ?? "—"}</td>
                  <td className="px-5 py-3.5 text-ink/65">{r.property_address ?? "—"}</td>
                  <td className="px-5 py-3.5 text-ink/65">{date(r.date)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.kind === "service" ? (
                        <ServiceStatusPills r={r} />
                      ) : (
                        <>
                          {r.paid ? (
                            <Pill tone="primary">Paid</Pill>
                          ) : (
                            <Pill tone="secondary">Due</Pill>
                          )}
                          {r.cleaner_unpaid && <Pill tone="secondary">Cleaner unpaid</Pill>}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <ChevronRight className="inline-flex h-4 w-4 text-ink/40" />
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

// Pill genérico. primary = feito/verde, secondary = pendente/âmbar, muted = neutro.
function Pill({ tone, children }: { tone: "primary" | "secondary" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "primary"
      ? "border-primary/25 bg-primary/10 text-primary"
      : tone === "secondary"
      ? "border-secondary/25 bg-secondary/10 text-secondary"
      : "border-black/10 bg-black/[0.03] text-ink/55";
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", cls)}>
      {children}
    </span>
  );
}

// Status de um invoice de service, num relance: se tudo pronto → "Settled";
// senão só as PENDÊNCIAS (o que ainda falta), pra chamar a atenção.
function ServiceStatusPills({ r }: { r: InvoiceRow }) {
  const settled = r.sent && r.paid && r.labor_paid && r.material_paid && r.commission_collected;
  if (settled) return <Pill tone="primary">Settled</Pill>;
  return (
    <>
      {!r.sent && <Pill tone="secondary">Not sent</Pill>}
      {!r.paid && <Pill tone="secondary">Owner due</Pill>}
      {!r.labor_paid && <Pill tone="muted">Labor due</Pill>}
      {!r.material_paid && <Pill tone="muted">Mat. due</Pill>}
      {!r.commission_collected && <Pill tone="muted">Comm. due</Pill>}
    </>
  );
}
