"use client";

import { useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { archiveClienteAction, unarchiveClienteAction } from "../actions";
import { Archive, ArchiveRestore } from "lucide-react";

export function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const [pending, start] = useTransition();

  if (archived) {
    return (
      <button
        onClick={() => start(() => unarchiveClienteAction(id))}
        disabled={pending}
        className={buttonClass("ghost")}
      >
        <ArchiveRestore className="h-4 w-4" /> {pending ? "Restoring…" : "Restore"}
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        // TRAVADO: arquivar, nunca deletar. Confirmação leve.
        if (confirm("Archive this client? The history is preserved (we never delete).")) {
          start(() => archiveClienteAction(id));
        }
      }}
      disabled={pending}
      className={buttonClass("danger")}
    >
      <Archive className="h-4 w-4" /> {pending ? "Archiving…" : "Archive"}
    </button>
  );
}
