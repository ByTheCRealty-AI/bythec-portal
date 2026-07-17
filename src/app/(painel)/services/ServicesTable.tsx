"use client";

// Tabela GLOBAL de serviços (todas as propriedades): filtro por status
// (All / Active / Done) + busca. Clicar na LINHA (parte destacada = endereço)
// abre uma JANELA de edição (modal, portal no body) pra atualizar/deletar o
// serviço — mesmo padrão do resto do portal.
import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, X, Loader2, Trash2 } from "lucide-react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { money, date, cx } from "@/lib/format";
import type { RequestStatus } from "@/lib/types";

export type ProviderOption = { id: string; name: string };

export interface ServiceListRow {
  id: string;
  date: string | null;
  property_id: string;
  property_address: string | null;
  property_address2: string | null;
  provider_id: string | null;
  provider_name: string | null;
  description: string | null;
  status: RequestStatus;
  done_at: string | null;
  price: number | null;
  created_by_name: string | null;
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

// Janela centralizada (portal no body) — mesmo padrão de providers/payments.
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-black/[0.08] bg-white shadow-2xl">
        {children}
      </div>
    </div>,
    document.body
  );
}

function EditServiceModal({
  service,
  providers,
  updateAction,
  deleteAction,
  onClose,
}: {
  service: ServiceListRow;
  providers: ProviderOption[];
  updateAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await updateAction(new FormData(e.currentTarget));
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("id", service.id);
      fd.set("property_id", service.property_id);
      await deleteAction(fd);
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete. Try again.");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-6 py-4">
        <div className="min-w-0">
          <h3 className="h-display text-lg text-ink">Edit service</h3>
          <p className="truncate text-xs text-ink/55">
            {service.property_address ?? "—"}
            {service.property_address2 ? ` · ${service.property_address2}` : ""}
          </p>
        </div>
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
        <input type="hidden" name="id" value={service.id} />
        <input type="hidden" name="property_id" value={service.property_id} />

        <Field label="Description *">
          <textarea
            name="description"
            required
            rows={3}
            defaultValue={service.description ?? ""}
            className={inputClass}
            placeholder="What is the service about?"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Provider">
            <select name="provider_id" defaultValue={service.provider_id ?? ""} className={inputClass}>
              <option value="">— None —</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={service.status} className={inputClass}>
              <option value="open">Active</option>
              <option value="done">Done</option>
            </select>
          </Field>
          <Field label="Date">
            <input
              name="service_request_date"
              type="date"
              defaultValue={service.date ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Price (USD)">
            <input
              name="price"
              type="number"
              step="0.01"
              min={0}
              defaultValue={service.price ?? ""}
              className={inputClass}
              placeholder="250.00"
            />
          </Field>
        </div>

        {error && (
          <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] pt-4">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
                className="text-sm text-ink/60 hover:text-ink"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}

          <button type="submit" disabled={busy} className={buttonClass("primary")}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              "Save changes"
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ServicesTable({
  rows,
  providers,
  canEdit,
  updateAction,
  deleteAction,
}: {
  rows: ServiceListRow[];
  providers: ProviderOption[];
  canEdit: boolean;
  updateAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ServiceListRow | null>(null);

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
                <th className="px-5 py-3 font-bold">Created by</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={canEdit ? () => setEditing(r) : undefined}
                  className={cx(
                    "border-t border-black/[0.05] transition hover:bg-primary/[0.04]",
                    i % 2 === 1 && "bg-black/[0.015]",
                    canEdit && "cursor-pointer"
                  )}
                >
                  <td className="whitespace-nowrap px-5 py-3.5 text-ink/65">
                    {r.status === "done" ? date(r.done_at ?? r.date) : date(r.date)}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cx("font-semibold", r.property_address ? "text-primary" : "text-ink/60")}>
                      {r.property_address ?? "—"}
                    </span>
                    {r.property_address2 && (
                      <span className="block text-xs text-ink/45">{r.property_address2}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-ink/70">
                    {r.provider_name ?? <span className="text-ink/35">—</span>}
                  </td>
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
                  <td className="whitespace-nowrap px-5 py-3.5 text-ink/55">
                    {r.created_by_name ?? <span className="text-ink/30">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && canEdit && (
        <EditServiceModal
          service={editing}
          providers={providers}
          updateAction={updateAction}
          deleteAction={deleteAction}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
