"use client";

// =============================================================================
// PropriedadeDeleteButton — hard delete OWNER ONLY, irreversível.
// =============================================================================
// Só é renderizado quando canDelete(profile) E a propriedade está arquivada (o
// page.tsx faz esse gate). Abre o ConfirmDialog, que exige digitar o endereço
// da propriedade pra habilitar o botão vermelho. Erros do banco aparecem dentro
// do modal.
//
// Se NÃO estiver arquivada, mostra hint discreto/desabilitado pra deixar a regra
// archive-first visível.

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { deletePropriedadeAction } from "./actions";

export function PropriedadeDeleteButton({
  id,
  address,
  archived,
}: {
  id: string;
  address: string;
  archived: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!archived) {
    return (
      <span
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-dashed border-black/[0.12] px-4 py-2 text-sm text-ink/40"
        title="Archive this property first to enable permanent delete."
      >
        <Trash2 className="h-4 w-4" /> Archive first to enable delete
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition-all duration-200 hover:bg-red-100"
      >
        <Trash2 className="h-4 w-4" /> Delete permanently
      </button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => deletePropriedadeAction(id)}
        title="Delete this property?"
        confirmPhrase={address}
        description={
          <>
            <p>
              This permanently deletes{" "}
              <strong className="text-ink">{address}</strong> and cannot be
              undone.
            </p>
            <p className="mt-2">
              All history tied to this property is removed by the safe cascade in
              the database.
            </p>
          </>
        }
      />
    </>
  );
}
