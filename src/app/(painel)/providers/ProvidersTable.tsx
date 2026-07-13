"use client";

// Diretório de service providers. Linhas limpas e clicáveis (sem botões na lista):
// clicar abre uma janelinha (modal) com detalhes + Edit + Delete; Delete abre um
// SEGUNDO modal de confirmação. Star (preferred) toggla direto na lista/modal e
// sobe pro topo. Campos: business name (name), point of contact + número, office
// number (phone), email, service type (dropdown), notify via, notes.
// Modal via portal no body (escapa o transform do wrapper → centraliza na tela).
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Search, Plus, Loader2, Check, Pencil, Trash2, X, Star } from "lucide-react";
import { Badge, Field, inputClass, selectClass, buttonClass } from "@/components/ui";
import { cx } from "@/lib/format";
import { NOTIFY_VIA_LABEL, SERVICE_TYPE_OPTIONS, type ServiceProvider } from "@/lib/types";

type Action = (fd: FormData) => void | Promise<void>;

function ProviderFields({ p }: { p?: ServiceProvider }) {
  const currentType = p?.service_type ?? "";
  const typeOptions =
    currentType && !SERVICE_TYPE_OPTIONS.includes(currentType)
      ? [currentType, ...SERVICE_TYPE_OPTIONS]
      : SERVICE_TYPE_OPTIONS;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Business name *">
        <input name="name" required defaultValue={p?.name ?? ""} className={inputClass} placeholder="Company name" />
      </Field>
      <Field label="Service type">
        <select name="service_type" defaultValue={currentType} className={selectClass}>
          <option value="">Select…</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Point of contact" hint="Who to ask for">
        <input name="contact_person" defaultValue={p?.contact_person ?? ""} className={inputClass} placeholder="e.g. Maria at the front desk" />
      </Field>
      <Field label="Email">
        <input name="email" type="email" defaultValue={p?.email ?? ""} className={inputClass} placeholder="name@email.com" />
      </Field>
      <Field label="Office number">
        <input name="phone" defaultValue={p?.phone ?? ""} className={inputClass} placeholder="(508) 555-0123" />
      </Field>
      <Field label="Point of contact’s number">
        <input name="contact_phone" defaultValue={p?.contact_phone ?? ""} className={inputClass} placeholder="(508) 555-0199" />
      </Field>
      <Field label="Notify via">
        <select name="notify_via" defaultValue={p?.notify_via ?? "email"} className={selectClass}>
          {Object.entries(NOTIFY_VIA_LABEL).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2.5 pt-7 text-sm text-ink/80">
        <input type="checkbox" name="preferred" value="1" defaultChecked={p?.preferred ?? false} className="h-4 w-4 rounded border-black/20" />
        <span className="inline-flex items-center gap-1">Preferred provider <Star className="h-3.5 w-3.5 text-amber-500" /></span>
      </label>
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
      setError("A business name is required.");
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

// Estrela clicável (toggla preferred). Otimista. stopPropagation pra não abrir o
// modal quando clicada na linha.
function StarToggle({
  p,
  toggleAction,
  canManage,
  size = "sm",
}: {
  p: ServiceProvider;
  toggleAction: Action;
  canManage: boolean;
  size?: "sm" | "lg";
}) {
  const [pending, start] = useTransition();
  const [pref, setPref] = useState(p.preferred);
  const cls = size === "lg" ? "h-5 w-5" : "h-4 w-4";

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canManage) return;
    const next = !pref;
    setPref(next);
    const fd = new FormData();
    fd.set("id", p.id);
    fd.set("preferred", next ? "1" : "0");
    start(async () => {
      try {
        await toggleAction(fd);
      } catch {
        setPref(!next);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending || !canManage}
      aria-label={pref ? "Unstar provider" : "Star provider"}
      title={pref ? "Preferred — click to unstar" : "Mark as preferred"}
      className="shrink-0 rounded-md p-0.5 transition hover:bg-black/[0.04] disabled:opacity-60"
    >
      <Star className={cx(cls, pref ? "fill-amber-400 text-amber-500" : "text-ink/25 hover:text-ink/45")} />
    </button>
  );
}

function Modal({ onClose, children, z = 50 }: { onClose: () => void; children: React.ReactNode; z?: number }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: z }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-black/[0.08] bg-white shadow-2xl">
        {children}
      </div>
    </div>,
    document.body
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
  toggleAction,
}: {
  providers: ServiceProvider[];
  canManage: boolean;
  createAction: Action;
  updateAction: Action;
  deleteAction: Action;
  toggleAction: Action;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{ provider: ServiceProvider | null; editing: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ServiceProvider | null>(null);
  const [delPending, startDelete] = useTransition();
  const [delError, setDelError] = useState<string | null>(null);

  const term = query.trim().toLowerCase();
  const filtered = term
    ? providers.filter((p) => {
        const hay = `${p.name ?? ""} ${p.service_type ?? ""} ${p.contact_person ?? ""}`.toLowerCase();
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
            placeholder="Search name, service or contact…"
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
                <th className="px-5 py-3 font-bold">Business</th>
                <th className="px-5 py-3 font-bold">Service</th>
                <th className="px-5 py-3 font-bold">Contact</th>
                <th className="px-5 py-3 font-bold">Phone</th>
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
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <StarToggle p={p} toggleAction={toggleAction} canManage={canManage} />
                      <span className="font-semibold text-ink">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {p.service_type ? (
                      <Badge tone="orange">{p.service_type}</Badge>
                    ) : (
                      <span className="text-ink/40">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-ink/65">
                    {p.contact_person ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-ink/65">
                    {p.phone ?? p.contact_phone ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Janelinha do provider */}
      {open && (
        <Modal onClose={() => setOpen(null)}>
          <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-6 py-4">
            <div className="flex items-start gap-2">
              {open.provider && !open.editing && (
                <StarToggle p={open.provider} toggleAction={toggleAction} canManage={canManage} size="lg" />
              )}
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
            </div>
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink/45 transition hover:bg-black/[0.04] hover:text-ink"
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
                  <DetailRow label="Point of contact" value={open.provider.contact_person} />
                  <DetailRow label="Contact’s number" value={open.provider.contact_phone} />
                  <DetailRow label="Office number" value={open.provider.phone} />
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

      {/* Confirmação de delete */}
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
              <button type="button" onClick={() => runDelete(confirmDelete)} disabled={delPending} className={buttonClass("danger")}>
                {delPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {delPending ? "Deleting…" : "Yes, delete"}
              </button>
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={delPending} className={buttonClass("ghost")}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
