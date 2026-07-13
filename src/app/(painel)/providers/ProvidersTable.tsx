"use client";

// Diretório de service providers com busca + CRUD inline (create / edit / delete).
// Delete = arquivar (a action arquiva; o histórico de services fica). Gated por
// canManage (operations.edit) — sem a cap, é só leitura.
import { useState, useTransition } from "react";
import { Search, Plus, Loader2, Check } from "lucide-react";
import { Badge, Field, inputClass, selectClass, buttonClass } from "@/components/ui";
import { DeleteControl, EditButton } from "@/components/inline-forms/InlineRowControls";
import { NOTIFY_VIA_LABEL, type ServiceProvider } from "@/lib/types";

type Action = (fd: FormData) => void | Promise<void>;

function ProviderFields({ p }: { p?: ServiceProvider }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Name *">
        <input name="name" required defaultValue={p?.name ?? ""} className={inputClass} placeholder="Provider or company name" />
      </Field>
      <Field label="Service type" hint="e.g. HVAC, Plumbing, Painting">
        <input name="service_type" defaultValue={p?.service_type ?? ""} className={inputClass} />
      </Field>
      <Field label="Phone">
        <input name="phone" defaultValue={p?.phone ?? ""} className={inputClass} placeholder="(508) 555-0123" />
      </Field>
      <Field label="Email">
        <input name="email" type="email" defaultValue={p?.email ?? ""} className={inputClass} placeholder="name@email.com" />
      </Field>
      <Field label="Notify via">
        <select name="notify_via" defaultValue={p?.notify_via ?? "email"} className={selectClass}>
          {Object.entries(NOTIFY_VIA_LABEL).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notes">
          <textarea name="notes" rows={2} defaultValue={p?.notes ?? ""} className={inputClass} />
        </Field>
      </div>
    </div>
  );
}

function ProviderForm({
  p,
  action,
  onDone,
  title,
  submitLabel,
}: {
  p?: ServiceProvider;
  action: Action;
  onDone: () => void;
  title: string;
  submitLabel: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (p) fd.set("id", p.id);
    if (!((fd.get("name") as string) ?? "").trim()) {
      setError("A provider name is required.");
      return;
    }
    start(async () => {
      try {
        await action(fd);
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="glass space-y-4 p-5">
      <h3 className="h-display text-base text-ink">{title}</h3>
      <ProviderFields p={p} />
      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
      )}
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {pending ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={onDone} disabled={pending} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ProvidersTable({
  providers,
  canManage,
  createAction,
  updateAction,
  deleteAction,
}: {
  providers: ServiceProvider[];
  canManage: boolean;
  createAction: Action;
  updateAction: Action;
  deleteAction: Action;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const term = query.trim().toLowerCase();
  const filtered = term
    ? providers.filter((p) => {
        const hay = `${p.name ?? ""} ${p.service_type ?? ""}`.toLowerCase();
        return term.split(/\s+/).every((word) => hay.includes(word));
      })
    : providers;

  const cols = canManage ? 5 : 4;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
          />
        </div>
        {canManage && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={buttonClass("primary")}>
            <Plus className="h-4 w-4" /> Add provider
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-4">
          <ProviderForm
            action={createAction}
            onDone={() => setAdding(false)}
            title="New provider"
            submitLabel="Create provider"
          />
        </div>
      )}

      {providers.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-10 text-center text-sm text-ink/55 shadow-card">
          No providers yet. {canManage ? "Add the first one above." : ""}
        </div>
      ) : filtered.length === 0 ? (
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
                {canManage && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) =>
                canManage && editingId === p.id ? (
                  <tr key={p.id} className="border-t border-black/[0.05] bg-black/[0.015]">
                    <td colSpan={cols} className="px-5 py-4">
                      <ProviderForm
                        p={p}
                        action={updateAction}
                        onDone={() => setEditingId(null)}
                        title={`Edit ${p.name}`}
                        submitLabel="Save changes"
                      />
                    </td>
                  </tr>
                ) : (
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
                      {p.phone && p.email && <span className="block text-xs text-ink/45">{p.email}</span>}
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
                    {canManage && (
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <EditButton onClick={() => setEditingId(p.id)} />
                          <DeleteControl action={deleteAction} hidden={{ id: p.id }} noun="provider" />
                        </div>
                      </td>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
