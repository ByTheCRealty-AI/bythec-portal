"use client";

// =============================================================================
// PaymentEntryButton — UM botão por linha que abre uma JANELA (modal, portal no
// body, igual à dos providers) pra registrar o pagamento de um aluguel. Substitui
// os dois botões antigos ("Record payment" que abria inline + "Mark received").
// Dentro da janela: resumo + progresso/parcelas (RentInstallmentsPanel) + um
// atalho "Mark paid in full" (recebido de uma vez, sem detalhar) / "Mark as due"
// (reabrir). Assim a Andrea entra o pagamento numa janela centralizada, não num
// scroll-down.
// =============================================================================

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2, Undo2, Wallet, X } from "lucide-react";
import { money, date } from "@/lib/format";
import { Field, inputClass } from "@/components/ui";
import { RentInstallmentsPanel, uploadReceipts, todayNY } from "./RentInstallmentsPanel";
import { PAYMENT_METHODS, PAYMENT_KIND_LABEL, type Payment, type PaymentStatus } from "@/lib/types";

// Janela centralizada — mesmo padrão do modal de providers (portal no body pra
// escapar do ancestral transformado e centralizar na tela).
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-black/[0.08] bg-white shadow-2xl">
        {children}
      </div>
    </div>,
    document.body
  );
}

// Atalho "recebi tudo de uma vez" / "reabrir". Marcar pago em cheio EXIGE recibo
// (prova de pagamento) — sobe o recibo e registra o pagamento do valor restante
// via addPartAction, que anexa o recibo (category='rent_receipt') e vira received.
// Reabrir (Mark as due) segue por setStatus (não exige recibo).
function FullPaymentControl({
  payment,
  remaining,
  setStatus,
  addPartAction,
}: {
  payment: Payment;
  remaining: number;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  addPartAction: (fd: FormData) => void | Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [hasFile, setHasFile] = useState(false);
  const received = payment.status === "received";

  function reopen() {
    setError(null);
    start(async () => {
      try {
        await setStatus(payment.id, "due");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update. Try again.");
      }
    });
  }

  async function markPaid(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const files = Array.from(fileRef.current?.files ?? []);
    if (!files.length) {
      setError("Attach a receipt to mark this paid.");
      return;
    }
    if (remaining <= 0) {
      setError("Nothing left to pay on this rent.");
      return;
    }
    const form = e.currentTarget;
    setBusy(true);
    try {
      const refs = await uploadReceipts(files);
      const fd = new FormData(form);
      fd.delete("receipt_files");
      fd.set("payment_id", payment.id);
      fd.set("property_id", payment.property_id);
      fd.set("amount", String(remaining));
      fd.set("paid_at", todayNY());
      fd.set("notes", "Paid in full");
      fd.set("receipts_json", JSON.stringify(refs));
      await addPartAction(fd);
      // O aluguel vira received; a linha sai da aba Due e a janela fecha sozinha.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  if (received) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <CheckCircle2 className="h-4 w-4" /> Paid in full
        </span>
        <button
          type="button"
          onClick={reopen}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.10] bg-white px-3 py-2 text-xs font-semibold text-ink/65 transition hover:border-secondary/40 hover:text-secondary disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
          Mark as due
        </button>
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <form onSubmit={markPaid} className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-ink">Mark paid in full</p>
        <p className="text-xs text-ink/45">
          Got the whole rent at once? Attach the receipt and mark it received.
        </p>
      </div>
      <Field label="Receipt (required)" hint="Image, HEIC, or PDF. Up to 25 MB each.">
        <input
          ref={fileRef}
          name="receipt_files"
          type="file"
          multiple
          required
          accept="image/*,application/pdf"
          onChange={(e) => setHasFile((e.target.files?.length ?? 0) > 0)}
          className={inputClass}
        />
      </Field>
      <Field label="Method">
        <select name="method" defaultValue="Zelle" className={inputClass}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
      )}
      <button
        type="submit"
        disabled={busy || !hasFile}
        className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-4 py-2.5 text-sm font-semibold text-primary transition hover:border-primary/50 hover:bg-primary/[0.10] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {busy ? "Saving…" : "Mark paid in full"}
      </button>
    </form>
  );
}

// Janela controlada (open/onClose). Aberta pelo CLIQUE NA LINHA do pagamento
// (row-click) em todas as telas de aluguel year-round: aba Due, Monthly, Past e
// a aba Payments de cada propriedade. Conteúdo idêntico à antiga PaymentEntryButton.
export function PaymentWindow({
  open,
  onClose,
  payment,
  canManage,
  supportsParts,
  setStatus,
  addPartAction,
  updatePartAction,
  deletePartAction,
}: {
  open: boolean;
  onClose: () => void;
  payment: Payment;
  canManage: boolean;
  // Aluguel (monthly/first/last) suporta parcelas; depósito etc. não → só o atalho.
  supportsParts: boolean;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  addPartAction: (fd: FormData) => void | Promise<void>;
  updatePartAction: (fd: FormData) => void | Promise<void>;
  deletePartAction: (fd: FormData) => void | Promise<void>;
}) {
  if (!open || !canManage) return null;

  const addr = payment.property?.address ?? "Payment";
  const showPanel = supportsParts;

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-6 py-4">
        <div className="min-w-0">
          <h3 className="h-display text-lg text-ink">Record payment</h3>
          <p className="truncate text-xs text-ink/55">
            {addr}
            {payment.property?.address2 ? ` · ${payment.property.address2}` : ""}
            {payment.tenant?.name ? ` · ${payment.tenant.name}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink/45 transition hover:bg-black/[0.04] hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-5 px-6 py-5">
        {/* Resumo */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/[0.06] bg-black/[0.015] px-4 py-3 text-sm">
          <span className="text-ink/60">
            {PAYMENT_KIND_LABEL[payment.kind]} rent · due {date(payment.due_date)}
          </span>
          <span className="font-semibold text-ink">{money(payment.rent_amount)}</span>
        </div>

        {/* Parcelas / progresso (só aluguel) */}
        {showPanel && (
          <RentInstallmentsPanel
            payment={payment}
            canManage={canManage}
            addPartAction={addPartAction}
            updatePartAction={updatePartAction}
            deletePartAction={deletePartAction}
          />
        )}

        {/* Atalho recebido de uma vez (exige recibo) / reabrir */}
        <div className="border-t border-black/[0.06] pt-4">
          <FullPaymentControl
            payment={payment}
            remaining={Math.max(0, (payment.rent_amount ?? 0) - (payment.amount_paid ?? 0))}
            setStatus={setStatus}
            addPartAction={addPartAction}
          />
        </div>
      </div>
    </Modal>
  );
}

// Botão-gatilho (compat). A maioria das telas abre pela linha (row-click).
export function PaymentEntryButton(props: {
  payment: Payment;
  canManage: boolean;
  supportsParts: boolean;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  addPartAction: (fd: FormData) => void | Promise<void>;
  updatePartAction: (fd: FormData) => void | Promise<void>;
  deletePartAction: (fd: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  if (!props.canManage) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/[0.06] px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:border-primary/50 hover:bg-primary/[0.10]"
      >
        <Wallet className="h-3.5 w-3.5" /> Record payment
      </button>
      <PaymentWindow open={open} onClose={() => setOpen(false)} {...props} />
    </>
  );
}
