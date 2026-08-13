"use client";

// Tabela de tenant requests: filtro por status (All / Open / Done) +
// busca instantânea por propriedade, inquilino ou descrição. Botão "Add request"
// (aba global) abre um modal com picker de propriedade — igual ao "Add service".
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, X, Loader2 } from "lucide-react";
import { date, cx } from "@/lib/format";
import { Field, inputClass, buttonClass } from "@/components/ui";
import type { RequestStatus } from "@/lib/types";

export interface RequestRow {
  id: string;
  date: string | null;
  description: string | null;
  status: RequestStatus;
  property_address: string | null;
  tenant_name: string | null;
  created_by_name: string | null;
}

export type RequestPropertyOption = { id: string; address: string; address2: string | null };

type Filter = "" | "open" | "done";

// Modal centrado (portal-to-body pattern das outras janelas).
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// Modal "Add request" — na aba global escolhe a PROPRIEDADE (o inquilino atual é
// resolvido no servidor). Mesmos campos do form da aba da propriedade + property.
function AddRequestModal({
  properties,
  addAction,
  onClose,
}: {
  properties: RequestPropertyOption[];
  addAction: (fd: FormData) => void | Promise<void>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await addAction(new FormData(e.currentTarget));
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-6 py-4">
        <h3 className="h-display text-lg text-ink">Add request</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink/45 transition hover:bg-black/[0.04] hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={save} className="space-y-4 px-6 py-5">
        <Field label="Property *">
          <select name="property_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select a property…
            </option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.address}
                {p.address2 ? ` · ${p.address2}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Description *">
          <textarea
            name="description"
            required
            rows={3}
            className={inputClass}
            placeholder="What does the tenant need? (e.g. heater not working)"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date">
            <input name="date" type="date" defaultValue={today} className={inputClass} />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue="open" className={inputClass}>
              <option value="open">Open</option>
              <option value="done">Done</option>
            </select>
          </Field>
        </div>

        {error && (
          <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={busy} className={buttonClass("primary")}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Adding…
              </>
            ) : (
              "Add request"
            )}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className={buttonClass("ghost")}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

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
      Open
    </span>
  );
}

export function RequestsTable({
  rows,
  canEdit = false,
  properties = [],
  addAction,
}: {
  rows: RequestRow[];
  canEdit?: boolean;
  properties?: RequestPropertyOption[];
  addAction?: (fd: FormData) => void | Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>("");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const chips: Array<{ value: Filter; label: string }> = [
    { value: "", label: "All" },
    { value: "open", label: "Open" },
    { value: "done", label: "Done" },
  ];

  const term = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (filter && r.status !== filter) return false;
    if (term) {
      const hay = `${r.property_address ?? ""} ${r.tenant_name ?? ""} ${r.description ?? ""}`.toLowerCase();
      return term.split(/\s+/).every((w) => hay.includes(w));
    }
    return true;
  });

  return (
    <>
      {canEdit && addAction && (
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => setAdding(true)} className={buttonClass("primary")}>
            <Plus className="h-4 w-4" /> Add request
          </button>
        </div>
      )}

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
          placeholder="Search property, tenant or description…"
          className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-10 text-center text-sm text-ink/55 shadow-card">
          No requests match the current filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-5 py-3 font-bold">Date</th>
                <th className="px-5 py-3 font-bold">Property</th>
                <th className="px-5 py-3 font-bold">Tenant</th>
                <th className="px-5 py-3 font-bold">Description</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3 font-bold">Created by</th>
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
                  <td className="whitespace-nowrap px-5 py-3.5 text-ink/65">{date(r.date)}</td>
                  <td className="px-5 py-3.5 text-ink/85">{r.property_address ?? "—"}</td>
                  <td className="px-5 py-3.5 text-ink/65">{r.tenant_name ?? "—"}</td>
                  <td className="px-5 py-3.5 text-ink/65">
                    {r.description ? (
                      <span className="line-clamp-2 max-w-md">{r.description}</span>
                    ) : (
                      <span className="text-ink/35">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-ink/55">
                    {r.created_by_name ?? <span className="text-ink/30">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && addAction && (
        <AddRequestModal
          properties={properties}
          addAction={addAction}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}
