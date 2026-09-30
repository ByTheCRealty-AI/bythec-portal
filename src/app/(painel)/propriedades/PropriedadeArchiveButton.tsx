"use client";

// =============================================================================
// Arquivar / restaurar uma casa — com CASCATA opcional (Andrea, 2026-09-30).
// =============================================================================
// "if i archive a property, i want the option to also automatically archive the
// tenant (if there is one) and the owner (but only if the owner has one
// property, if the owner has multiple, then only the property and the tenant)."
//
// A confirmação mostra EXATAMENTE quem mais será arquivado, com checkbox por
// pessoa já MARCADA (escolha dela: automático por default, dá pra desmarcar).
// Se o inquilino tem aluguel VENCIDO, a linha avisa — mas não bloqueia (escolha
// dela: "warn me, but let me archive").
//
// Restaurar mostra as mesmas pessoas que foram arquivadas junto, também
// marcadas — desfazer um arquivamento errado é um clique.
//
// Modal via createPortal(document.body): `fixed` dentro do AppShell (que tem
// transform) ancora no ancestral e abre fora da tela — lesson 2026-08-14.
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { buttonClass } from "@/components/ui";
import { archivePropriedadeAction, unarchivePropriedadeAction } from "./actions";
import { Archive, ArchiveRestore, Loader2, AlertTriangle } from "lucide-react";
import { money } from "@/lib/format";

export type CascadeTenant = { id: string; name: string; pastDueCount: number; pastDueTotal: number };
export type CascadeOwner = { id: string; name: string; eligible: boolean; reason: string | null };
export type ArchivedCompanion = { id: string; name: string; role: string };

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl">
        {children}
      </div>
    </div>,
    document.body
  );
}

function Row({
  checked,
  onToggle,
  title,
  sub,
  warn,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  sub: string | null;
  warn?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 " +
        (disabled
          ? "cursor-not-allowed border-black/[0.06] bg-black/[0.02] opacity-70"
          : warn
          ? "cursor-pointer border-amber-400/40 bg-amber-50"
          : "cursor-pointer border-black/[0.08] bg-black/[0.015]")
      }
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="mt-0.5 h-4 w-4 rounded border-black/25 text-primary focus:ring-primary/30"
      />
      <span className="text-sm text-ink/85">
        <span className="font-semibold text-ink">{title}</span>
        {sub && <span className="mt-0.5 block text-xs text-ink/55">{sub}</span>}
      </span>
    </label>
  );
}

export function PropriedadeArchiveButton({
  id,
  archived,
  tenant = null,
  owner = null,
  archivedWith = [],
}: {
  id: string;
  archived: boolean;
  tenant?: CascadeTenant | null;
  owner?: CascadeOwner | null;
  archivedWith?: ArchivedCompanion[];
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withTenant, setWithTenant] = useState(true);
  const [withOwner, setWithOwner] = useState(true);
  const [restoreIds, setRestoreIds] = useState<Set<string>>(() => new Set(archivedWith.map((c) => c.id)));

  const ownerEligible = !!owner?.eligible;

  function run(fn: () => Promise<void>) {
    setError(null);
    start(async () => {
      try {
        await fn();
        setOpen(false);
      } catch (e) {
        // redirect() do Next levanta um erro de controle — não é falha.
        const msg = e instanceof Error ? e.message : "Could not finish. Try again.";
        if (/NEXT_REDIRECT/i.test(msg)) return;
        setError(msg);
      }
    });
  }

  // ---- Restaurar ------------------------------------------------------------
  if (archived) {
    return (
      <>
        <button onClick={() => setOpen(true)} disabled={pending} className={buttonClass("ghost")}>
          <ArchiveRestore className="h-4 w-4" /> {pending ? "Restoring…" : "Restore"}
        </button>
        {open && (
          <Modal onClose={() => !pending && setOpen(false)}>
            <h3 className="h-display text-lg text-ink">Restore this property?</h3>
            {archivedWith.length === 0 ? (
              <p className="mt-2 text-sm text-ink/70">The property comes back to the active list.</p>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink/70">
                  {archivedWith.length === 1 ? "This person was" : "These people were"} archived together with it.
                  Bring {archivedWith.length === 1 ? "them" : "them"} back too?
                </p>
                <div className="mt-3 space-y-2">
                  {archivedWith.map((c) => (
                    <Row
                      key={c.id}
                      checked={restoreIds.has(c.id)}
                      onToggle={() =>
                        setRestoreIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        })
                      }
                      title={c.name}
                      sub={c.role}
                    />
                  ))}
                </div>
              </>
            )}
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => run(() => unarchivePropriedadeAction(id, [...restoreIds]))}
                disabled={pending}
                className={buttonClass("primary")}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />}
                {pending ? "Restoring…" : "Restore"}
              </button>
              <button onClick={() => setOpen(false)} disabled={pending} className={buttonClass("ghost")}>
                Cancel
              </button>
            </div>
          </Modal>
        )}
      </>
    );
  }

  // ---- Arquivar -------------------------------------------------------------
  return (
    <>
      <button onClick={() => setOpen(true)} disabled={pending} className={buttonClass("danger")}>
        <Archive className="h-4 w-4" /> {pending ? "Archiving…" : "Archive"}
      </button>
      {open && (
        <Modal onClose={() => !pending && setOpen(false)}>
          <h3 className="h-display text-lg text-ink">Archive this property?</h3>
          <p className="mt-2 text-sm text-ink/70">
            The history is preserved — we never delete. Unpaid and scheduled payments are archived with it.
          </p>

          {(tenant || owner) && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/45">Archive with it</p>

              {tenant && (
                <Row
                  checked={withTenant}
                  onToggle={() => setWithTenant((v) => !v)}
                  title={tenant.name}
                  warn={tenant.pastDueCount > 0}
                  sub={
                    tenant.pastDueCount > 0
                      ? `Current tenant · still owes ${money(tenant.pastDueTotal)} past due (${tenant.pastDueCount} ${
                          tenant.pastDueCount === 1 ? "payment" : "payments"
                        })`
                      : "Current tenant"
                  }
                />
              )}

              {owner && (
                <Row
                  checked={ownerEligible && withOwner}
                  disabled={!ownerEligible}
                  onToggle={() => setWithOwner((v) => !v)}
                  title={owner.name}
                  sub={ownerEligible ? "Owner · this is their only active property" : owner.reason}
                />
              )}
            </div>
          )}

          {tenant?.pastDueCount ? (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Archiving the tenant doesn&rsquo;t write off what they owe — the record stays.
            </p>
          ) : null}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-5 flex gap-3">
            <button
              onClick={() =>
                run(() =>
                  archivePropriedadeAction(id, {
                    tenant: !!tenant && withTenant,
                    owner: !!owner && ownerEligible && withOwner,
                  })
                )
              }
              disabled={pending}
              className={buttonClass("danger")}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
              {pending ? "Archiving…" : "Archive"}
            </button>
            <button onClick={() => setOpen(false)} disabled={pending} className={buttonClass("ghost")}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
