"use client";

// =============================================================================
// DeleteButton (Cliente) — hard delete OWNER ONLY, irreversível.
// =============================================================================
// Só é renderizado quando canDelete(profile) E o registro está arquivado (o
// page.tsx faz esse gate). Abre o ConfirmDialog, que exige digitar o nome do
// cliente pra habilitar o botão vermelho. Em caso de erro do banco (ex.: o
// cliente ainda tem propriedades), a mensagem aparece dentro do modal.
//
// Se o registro NÃO estiver arquivado, mostra um hint discreto e desabilitado
// ("Archive first to enable delete") pra deixar a regra archive-first visível.

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { deleteClienteAction } from "../actions";

export function DeleteButton({
  id,
  name,
  archived,
}: {
  id: string;
  name: string;
  archived: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!archived) {
    return (
      <span
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-dashed border-black/[0.12] px-4 py-2 text-sm text-ink/40"
        title="Archive this client first to enable permanent delete."
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
        onConfirm={() => deleteClienteAction(id)}
        title="Delete this client?"
        confirmPhrase={name}
        description={
          <>
            <p>
              This permanently deletes{" "}
              <strong className="text-ink">{name}</strong> and cannot be undone.
            </p>
            <p className="mt-2">
              If this client still owns properties, the database will block the
              delete and ask you to remove or reassign them first.
            </p>
          </>
        }
      />
    </>
  );
}
