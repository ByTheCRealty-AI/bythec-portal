"use client";

// Diretório de service providers. Linhas LIMPAS e clicáveis (sem botões na lista):
// clicar abre uma janelinha (modal) com os detalhes + Edit + Delete. Delete abre
// um SEGUNDO modal de confirmação ("are you sure?"). Delete = arquivar (a action
// arquiva; histórico de services fica). Gated por canManage (operations.edit).
import { useState, useTransition } from "react";
import { Search, Plus, Loader2, Check, Pencil, Trash2, X } from "lucide-react";
import { Badge, Field, inputClass, selectClass, buttonClass } from "@/components/ui";
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
  onCancel,
  submitLabel,
}: {
  p?: ServiceProvider;
  action: Action;
  onDone: () => void;
  onCancel: () => void;
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
    <form onSubmit={submit} className="space-y-4">
      <ProviderFields p={p} />
      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
      )}
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {pending ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// Overlay genérico (janelinha centralizada com backdrop). z alto pra ficar sobre a lista.
function Modal({ onClose, children, z = 50 }: { onClose: () => void; children: React.ReactNode; z?: number }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: z }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md rounded-2xl border border-black/[0.08] bg-white shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-black/[0.06] py-2.5 text-sm">
      <span className="text-ink/45">{label}</span>
      <span className={"text-right " + (accent ? "text-primary" : "text-ink/85")}>{value || "—"}</span>
    </div>
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
  // Modal aberto: { provider, editing } — provider null = criar novo.
  const [open, setOpen] = useState<{ provider: ServiceProvider | null; editing: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ServiceProvider | null>(null);
  const [delPending, startDelete] = useTransition();
  const [delError, setDelError] = useState<string | null>(null);

  const term = query.trim().toLowerCase();
  const filtered = term
    ? providers.filter((p) => {
        const hay = `${p.name ?? ""} ${p.service_type ?? ""}`.toLowerCase();
        return term.split(/\s+/).every((word) => hay.includes(word));
      })
    : providers;

  function runDelete(p: ServiceProvider) {
    setDelError(null);
    const fd = new FormData();
    fd.set("id", p.id);
    startDelete(async () => {
      try {
        await deleteAction(fd);
        setConfirmDelete(null);
        setOpen(null);
      } catch (err) {
        setDelError(err instanceof Error ? err.message : "Could not delete. Try again.");
      }
    });
  }

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
        {canManage && (
          <button type="button" onClick={() => setOpen({ provider: null, editing: true })} className={buttonClass("primary")}>
            <Plus className="h-4 w-4" /> Add provider
          </button>
        )}
      </div>

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
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr
                  key={p.id}
                  onClick={() => canManage && setOpen({ provider: p, editing: false })}
                  className={
                    "border-t border-black/[0.05] transition " +
                    (canManage ? "cursor-pointer hover:bg-primary/[0.04] " : "") +
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
                  </td>
                  <td className="px-5 py-3.5 text-ink/55">
                    {p.notes ? (
                      <span className="line-clamp-1 max-w-xs">{p.notes}</span>
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

      {/* Janelinha do provider (detalhe / edição / criação) */}
      {open && (
        <Modal onClose={() => setOpen(null)}>
          <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-6 py-4">
            <div>
              <h3 className="h-display text-lg text-ink">
                {open.provider ? (open.editing ? `Edit ${open.provider.name}` : open.provider.name) : "New provider"}
              </h3>
              {open.provider && !open.editing && open.provider.service_type && (
                <span className="mt-1 inline-block">
                  <Badge tone="orange">{open.provider.service_type}</Badge>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-ink/45 transition hover:bg-black/[0.04] hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-6 py-5">
            {open.editing ? (
              <ProviderForm
                p={open.provider ?? undefined}
                action={open.provider ? updateAction : createAction}
                submitLabel={open.provider ? "Save changes" : "Create provider"}
                onCancel={() => (open.provider ? setOpen({ provider: open.provider, editing: false }) : setOpen(null))}
                onDone={() => setOpen(null)}
              />
            ) : open.provider ? (
              <>
                <div className="mb-5">
                  <DetailRow label="Phone" value={open.provider.phone} />
                  <DetailRow label="Email" value={open.provider.email} accent />
                  <DetailRow label="Notify via" value={open.provider.notify_via ? NOTIFY_VIA_LABEL[open.provider.notify_via] : null} />
                  <DetailRow
                    label="Notes"
                    value={open.provider.notes ? <span className="whitespace-pre-wrap">{open.provider.notes}</span> : null}
                  />
                </div>
                {canManage && (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setOpen({ provider: open.provider, editing: true })}
                      className={buttonClass("primary")}
                    >
                      <Pencil className="h-4 w-4" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => open.provider && setConfirmDelete(open.provider)}
                      className={buttonClass("danger")}
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </Modal>
      )}

      {/* Segundo modal: confirmação de delete ("are you sure?") */}
      {confirmDelete && (
        <Modal onClose={() => !delPending && setConfirmDelete(null)} z={60}>
          <div className="px-6 py-5">
            <h3 className="h-display text-lg text-ink">Delete this provider?</h3>
            <p className="mt-2 text-sm text-ink/70">
              Are you sure you want to delete <span className="font-semibold text-ink">{confirmDelete.name}</span>? It
              will be removed from the directory. Their service history is kept.
            </p>
            {delError && <p className="mt-3 text-sm text-red-600">{delError}</p>}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => runDelete(confirmDelete)}
                disabled={delPending}
                className={buttonClass("danger")}
              >
                {delPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {delPending ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={delPending}
                className={buttonClass("ghost")}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
