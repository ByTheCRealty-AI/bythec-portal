"use client";

// Seção colapsável de pagamentos de EX-INQUILINOS na aba Payments da propriedade.
// A lista principal mostra só o inquilino atual; o histórico de quem já saiu fica
// aqui, agrupado por ex-inquilino (colapsado por default). Reusa a
// PropertyPaymentsTable por grupo — os pagamentos continuam editáveis, e cada
// grupo tem um atalho "Move unpaid rent to <current tenant>" (lease takeover).
import { useState, useTransition } from "react";
import { ChevronRight, ChevronDown, ArrowRightLeft, Loader2 } from "lucide-react";
import { PropertyPaymentsTable } from "./PropertyPaymentsTable";
import { moveUnpaidRentAction } from "../../payments/actions";
import type { OwnerPayoutActions } from "../../payments/OwnerPayoutControl";
import type { CommissionActions } from "../../payments/CommissionCollectedControl";
import type { DepositActions } from "../../payments/DepositReceivedControl";
import type { TenantOption } from "../../payments/TenantReassignControl";
import type { PaymentStatus, Payment } from "@/lib/types";

type Group = { key: string; name: string; range: string | null; payments: Payment[] };

const RENT_KINDS = new Set(["monthly", "first_month", "last_month"]);
function unpaidRentCount(payments: Payment[]): number {
  return payments.filter((p) => p.status === "due" && RENT_KINDS.has(p.kind)).length;
}

// Botão de mover em lote as mensais devidas do ex-inquilino pro inquilino atual.
// Dois cliques (confirma) — é mudança de dados. Reusa moveUnpaidRentAction.
function MoveUnpaidButton({
  propertyId,
  fromTenantId,
  toTenant,
  count,
}: {
  propertyId: string;
  fromTenantId: string;
  toTenant: TenantOption;
  count: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    const fd = new FormData();
    fd.set("property_id", propertyId);
    fd.set("from_tenant_id", fromTenantId);
    fd.set("to_tenant_id", toTenant.id);
    start(async () => {
      try {
        await moveUnpaidRentAction(fd);
        setConfirming(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not move. Try again.");
      }
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setConfirming(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/[0.06] px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:border-primary/50 hover:bg-primary/[0.10]"
      >
        <ArrowRightLeft className="h-3.5 w-3.5" /> Move {count} unpaid to {toTenant.name}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
        Confirm move
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="text-xs text-ink/60 hover:text-ink"
      >
        Cancel
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  );
}

export function PastTenantPaymentsSection({
  groups,
  canManage,
  setStatus,
  updateAction,
  deleteAction,
  addPartAction,
  updatePartAction,
  deletePartAction,
  ownerActions,
  commissionActions,
  depositActions,
  tenants,
  propertyId,
  currentTenant,
}: {
  groups: Group[];
  canManage: boolean;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  updateAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
  addPartAction?: (fd: FormData) => void | Promise<void>;
  updatePartAction?: (fd: FormData) => void | Promise<void>;
  deletePartAction?: (fd: FormData) => void | Promise<void>;
  ownerActions?: OwnerPayoutActions;
  commissionActions?: CommissionActions;
  depositActions?: DepositActions;
  tenants?: TenantOption[];
  propertyId: string;
  // Inquilino atual (destino do "move unpaid"). null quando a propriedade está vaga.
  currentTenant?: TenantOption | null;
}) {
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const total = groups.reduce((n, g) => n + g.payments.length, 0);

  function toggleGroup(k: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition hover:bg-black/[0.015]"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink/70">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Past tenants ({groups.length})
        </span>
        <span className="text-xs text-ink/45">
          {total} payment{total === 1 ? "" : "s"}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-black/[0.06] p-4">
          {groups.map((g) => {
            const isOpen = openGroups.has(g.key);
            const dueCount = unpaidRentCount(g.payments);
            // Mostra o "move unpaid" só quando: há inquilino atual, o grupo NÃO é
            // o próprio atual, o grupo é um inquilino real (não "__none__") e há
            // mensal devida pra mover.
            const showMove =
              canManage &&
              !!currentTenant &&
              g.key !== "__none__" &&
              g.key !== currentTenant.id &&
              dueCount > 0;
            return (
              <div key={g.key} className="rounded-xl border border-black/[0.07] bg-black/[0.012]">
                <div className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.key)}
                    className="inline-flex items-center gap-2 text-left text-sm font-medium text-ink/80"
                  >
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {g.name}
                    <span className="text-xs font-normal text-ink/45">
                      · {g.range ? `${g.range} · ` : ""}
                      {g.payments.length} payment{g.payments.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  {showMove && currentTenant && (
                    <MoveUnpaidButton
                      propertyId={propertyId}
                      fromTenantId={g.key}
                      toTenant={currentTenant}
                      count={dueCount}
                    />
                  )}
                </div>
                {isOpen && (
                  <div className="px-3 pb-3">
                    <PropertyPaymentsTable
                      payments={g.payments}
                      canManage={canManage}
                      setStatus={setStatus}
                      updateAction={updateAction}
                      deleteAction={deleteAction}
                      addPartAction={addPartAction}
                      updatePartAction={updatePartAction}
                      deletePartAction={deletePartAction}
                      ownerActions={ownerActions}
                      commissionActions={commissionActions}
                      depositActions={depositActions}
                      tenants={tenants}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
