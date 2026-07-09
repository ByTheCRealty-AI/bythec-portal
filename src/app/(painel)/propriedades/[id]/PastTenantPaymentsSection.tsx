"use client";

// Seção colapsável de pagamentos de EX-INQUILINOS na aba Payments da propriedade.
// A lista principal mostra só o inquilino atual; o histórico de quem já saiu fica
// aqui, agrupado por ex-inquilino (colapsado por default). Reusa a
// PropertyPaymentsTable por grupo — os pagamentos continuam editáveis.
import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { PropertyPaymentsTable } from "./PropertyPaymentsTable";
import type { PaymentStatus, Payment } from "@/lib/types";

type Group = { key: string; name: string; range: string | null; payments: Payment[] };

export function PastTenantPaymentsSection({
  groups,
  canManage,
  setStatus,
  updateAction,
  deleteAction,
  addPartAction,
  updatePartAction,
  deletePartAction,
}: {
  groups: Group[];
  canManage: boolean;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  updateAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
  addPartAction?: (fd: FormData) => void | Promise<void>;
  updatePartAction?: (fd: FormData) => void | Promise<void>;
  deletePartAction?: (fd: FormData) => void | Promise<void>;
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
            return (
              <div key={g.key} className="rounded-xl border border-black/[0.07] bg-black/[0.012]">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.key)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left"
                >
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-ink/80">
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {g.name}
                  </span>
                  <span className="text-xs text-ink/45">
                    {g.range ? `${g.range} · ` : ""}
                    {g.payments.length} payment{g.payments.length === 1 ? "" : "s"}
                  </span>
                </button>
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
