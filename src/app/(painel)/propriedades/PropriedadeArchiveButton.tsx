"use client";

import { useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { archivePropriedadeAction, unarchivePropriedadeAction } from "./actions";
import { Archive, ArchiveRestore } from "lucide-react";

export function PropriedadeArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const [pending, start] = useTransition();

  if (archived) {
    return (
      <button onClick={() => start(() => unarchivePropriedadeAction(id))} disabled={pending} className={buttonClass("ghost")}>
        <ArchiveRestore className="h-4 w-4" /> {pending ? "Restaurando…" : "Restaurar"}
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        if (confirm("Arquivar esta propriedade? O histórico é preservado (nunca deletamos).")) {
          start(() => archivePropriedadeAction(id));
        }
      }}
      disabled={pending}
      className={buttonClass("danger")}
    >
      <Archive className="h-4 w-4" /> {pending ? "Arquivando…" : "Arquivar"}
    </button>
  );
}
