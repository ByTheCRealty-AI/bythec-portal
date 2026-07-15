"use client";

// Seção colapsável de documentos de EX-INQUILINOS na aba Documents da propriedade.
// Espelha a PastTenantPaymentsSection: a lista principal mostra o inquilino ATUAL
// + os documentos da propriedade; o histórico de quem já saiu fica aqui, agrupado
// por ex-inquilino, COLAPSADO por default. Reusa DocumentRow por grupo (edição,
// re-tag e download continuam funcionando).
import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { DocumentRow } from "@/components/inline-forms/DocumentRow";
import type { Document } from "@/lib/types";

type TenantOption = { id: string; name: string; archived: boolean };
type Group = { key: string; name: string; archived: boolean; docs: Document[] };

export function PastTenantDocumentsSection({
  groups,
  canDelete,
  deleteAction,
  canEditTenancy,
  currentTenant,
  tenantOptions,
  updateTenancyAction,
}: {
  groups: Group[];
  canDelete: boolean;
  deleteAction: (fd: FormData) => void | Promise<void>;
  canEditTenancy: boolean;
  currentTenant: { id: string; name: string } | null;
  tenantOptions: TenantOption[];
  updateTenancyAction: (fd: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const total = groups.reduce((n, g) => n + g.docs.length, 0);

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
          {total} document{total === 1 ? "" : "s"}
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
                    {g.archived ? " (archived)" : ""}
                  </span>
                  <span className="text-xs text-ink/45">
                    {g.docs.length} document{g.docs.length === 1 ? "" : "s"}
                  </span>
                </button>
                {isOpen && (
                  <ul className="space-y-3 px-3 pb-3">
                    {g.docs.map((d) => (
                      <DocumentRow
                        key={d.id}
                        doc={d}
                        canDelete={canDelete}
                        deleteAction={deleteAction}
                        canEditTenancy={canEditTenancy}
                        currentTenant={currentTenant}
                        tenantOptions={tenantOptions}
                        updateTenancyAction={updateTenancyAction}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
