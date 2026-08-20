"use client";

// =============================================================================
// InlineDateEditor — campo de data editável inline. Recebe uma server action
// (fd => void) e chama ela com { id, date } ao mudar. Sem permissão, mostra só a
// data formatada (read-only). Usado pra corrigir datas de fechamento de deal
// (cliente que comprou) e de venda de listing (casa vendida).
// =============================================================================

import { useState, useTransition } from "react";
import { date as fmtDate } from "@/lib/format";

export function InlineDateEditor({
  action,
  id,
  initial,
  canEdit,
}: {
  action: (fd: FormData) => Promise<void> | void;
  id: string;
  initial: string | null;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(initial ? initial.slice(0, 10) : "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) {
    return <span className="text-sm text-ink">{initial ? fmtDate(initial) : "—"}</span>;
  }

  function save(next: string) {
    setValue(next);
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("date", next);
    start(async () => {
      try {
        await action(fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the date.");
      }
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={value}
        onChange={(e) => save(e.target.value)}
        disabled={pending}
        className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
      />
      {pending && <span className="text-xs text-ink/40">Saving…</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
