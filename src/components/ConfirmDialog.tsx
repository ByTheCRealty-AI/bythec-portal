"use client";

// =============================================================================
// ConfirmDialog — confirmação modal para ações destrutivas (hard delete)
// =============================================================================
// Reutilizável. Segue o padrão de modal do NewInvoiceButton (createPortal pra
// document.body, pra escapar do ancestral transformado que vira containing block
// do fixed). Pra ações IRREVERSÍVEIS, exige digitar uma frase de confirmação
// (`confirmPhrase`, ex.: o nome do registro) antes de habilitar o botão vermelho.
//
// Mostra o erro vindo do banco (ex.: "Archive the property before deleting it.")
// dentro do próprio modal, sem fechá-lo — assim o usuário lê e corrige.
// =============================================================================

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";

// Quando a server action chama redirect(), o Next sinaliza com um erro especial
// (digest "NEXT_REDIRECT;..."). Em sucesso isso é ESPERADO — não pode virar
// mensagem de erro vermelha; precisa ser re-lançado pra o Next navegar. O mesmo
// vale pro notFound() (digest "NEXT_NOT_FOUND").
function isNextControlFlowError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmPhrase,
  confirmLabel = "Delete permanently",
}: {
  open: boolean;
  onClose: () => void;
  // Deve LANÇAR (throw) com a mensagem do banco se falhar; o sucesso normalmente
  // redireciona (a server action faz redirect()), então o modal nem reabre.
  onConfirm: () => Promise<void>;
  title: string;
  description: React.ReactNode;
  // Frase que o usuário precisa digitar exatamente pra habilitar o botão.
  confirmPhrase: string;
  confirmLabel?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => setMounted(true), []);

  // Reseta o campo e o erro toda vez que abre/fecha.
  useEffect(() => {
    if (!open) {
      setTyped("");
      setError(null);
    }
  }, [open]);

  if (!open || !mounted) return null;

  const matches = typed.trim() === confirmPhrase.trim();
  const disabled = !matches || pending;

  function handleConfirm() {
    if (disabled) return;
    setError(null);
    start(async () => {
      try {
        await onConfirm();
        // Sucesso: a action redireciona. Se por acaso não redirecionar, fecha.
        onClose();
      } catch (e) {
        // redirect()/notFound() são fluxo normal de sucesso — re-lançar pra o
        // Next navegar, NUNCA mostrar como erro.
        if (isNextControlFlowError(e)) throw e;
        const msg =
          e instanceof Error && e.message
            ? e.message
            : "Something went wrong. Please try again.";
        setError(msg);
      }
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={() => (pending ? null : onClose())}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-black/[0.07] bg-white p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <h2 className="h-display text-lg text-ink">{title}</h2>
          </div>
          <button
            onClick={onClose}
            disabled={pending}
            className="text-ink/40 transition hover:text-ink disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="text-sm leading-relaxed text-ink/70">{description}</div>

        <div className="mt-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
              Type{" "}
              <span className="font-bold text-ink/80">{confirmPhrase}</span> to
              confirm
            </span>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-black/[0.12] bg-white px-3.5 py-2.5 text-sm text-ink placeholder-ink/35 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-200"
              placeholder={confirmPhrase}
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/[0.10] bg-white px-4 py-2 text-sm text-ink/80 transition-all duration-200 hover:bg-black/[0.03] hover:border-black/20 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={disabled}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(220,38,38,0.6)] transition-all duration-200 hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300 disabled:shadow-none"
          >
            {pending ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
