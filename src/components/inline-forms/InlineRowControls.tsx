"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2, Loader2 } from "lucide-react";

// Pequenos controles inline reutilizados pelas rows de Notes/Services/Requests/
// Documents: um botão Edit (lápis) e um Delete (lixeira) com confirmação LEVE
// embutida ("Delete this? [Delete] [Cancel]"). NUNCA usar o ConfirmDialog
// pesado (type-to-confirm) — esse é reservado pra deleção de client/property
// inteiros. Aqui é rápido, na própria row.

// Botão Edit discreto (icon + texto), só aparece quando a cap permite.
export function EditButton({ onClick, label = "Edit" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.10] bg-white px-2.5 py-1.5 text-xs font-semibold text-ink/70 transition-all duration-200 hover:border-primary/40 hover:bg-primary/[0.04] hover:text-primary"
    >
      <Pencil className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

// Delete com confirmação leve embutida. Recebe a server action (FormData) e os
// campos hidden (id, parent/property reference, e p/ documentos o file_url).
// Mostra "Delete this <noun>?" inline com [Delete] [Cancel] ao clicar na lixeira.
export function DeleteControl({
  action,
  hidden,
  noun = "item",
}: {
  action: (fd: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  noun?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function runDelete() {
    setError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(hidden)) fd.set(k, v);
    start(async () => {
      try {
        await action(fd);
        // sucesso: a row some na revalidação; não precisa resetar estado.
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete. Try again.");
        setConfirming(false);
      }
    });
  }

  if (confirming) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="text-xs text-ink/60">Delete this {noun}?</span>
        <button
          type="button"
          onClick={runDelete}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Delete
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-lg border border-black/[0.10] bg-white px-2.5 py-1.5 text-xs font-semibold text-ink/70 transition hover:bg-black/[0.03]"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.10] bg-white px-2.5 py-1.5 text-xs font-semibold text-ink/70 transition-all duration-200 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
