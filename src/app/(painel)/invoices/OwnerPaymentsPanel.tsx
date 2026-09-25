"use client";

// =============================================================================
// Pagamentos do OWNER numa invoice — parcial ou total (migration 0050).
// =============================================================================
// Andrea (2026-09-25): "sometimes owners pay me a partial payment and not the
// full amount. i need something like we do in the payments to display this
// internally BUT it also needs to appear on the invoice."
//
// Espelha o RentInstallmentsPanel do aluguel: cada pagamento com valor, DATA e
// método próprios. Antes disso ela lançava um item 'credit' com a data digitada
// na descrição (invoice #166: "Payment Received August 21, 2026").
//
// Ordem CRONOLÓGICA (mais antigo primeiro): é extrato de dinheiro, não lista de
// arquivos — a regra "uploads do mais novo pro mais antigo" não se aplica aqui.
//
// O status `paid` da invoice é DERIVADO no servidor pela soma; aqui só lançamos.
import { useState, useTransition } from "react";
import { Plus, Loader2, Check, Trash2, Pencil, X, Wallet } from "lucide-react";
import { buttonClass, inputClass, selectClass, Field } from "@/components/ui";
import { money, date as fmtDate, cx } from "@/lib/format";
import { INVOICE_PAYMENT_METHODS, type InvoicePayment } from "@/lib/types";

type Action = (fd: FormData) => void | Promise<void>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OwnerPaymentsPanel({
  invoiceId,
  canManage,
  ownerTotal,
  payments,
  addAction,
  updateAction,
  deleteAction,
}: {
  invoiceId: string;
  canManage: boolean;
  ownerTotal: number;
  payments: InvoicePayment[];
  addAction: Action;
  updateAction: Action;
  deleteAction: Action;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const paidToDate = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const balance = Math.max(0, Math.round((ownerTotal - paidToDate) * 100) / 100);
  const fullyPaid = ownerTotal > 0 && paidToDate + 0.005 >= ownerTotal;
  const partial = paidToDate > 0 && !fullyPaid;

  function submit(e: React.FormEvent<HTMLFormElement>, action: Action, paymentId?: string) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("invoice_id", invoiceId);
    if (paymentId) fd.set("id", paymentId);
    start(async () => {
      try {
        await action(fd);
        setAdding(false);
        setEditingId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save that payment.");
      }
    });
  }

  function remove(p: InvoicePayment) {
    setError(null);
    const fd = new FormData();
    fd.set("id", p.id);
    fd.set("invoice_id", invoiceId);
    start(async () => {
      try {
        await deleteAction(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove that payment.");
      }
    });
  }

  function Fields({ p }: { p?: InvoicePayment }) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Amount *">
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={p ? String(p.amount) : ""}
            className={inputClass}
            placeholder="1000.00"
          />
        </Field>
        <Field label="Date paid *">
          <input name="paid_at" type="date" required defaultValue={p?.paid_at ?? today()} className={inputClass} />
        </Field>
        <Field label="How paid">
          <select name="method" defaultValue={p?.method ?? ""} className={selectClass}>
            <option value="">—</option>
            {INVOICE_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-3">
          <Field label="Note">
            <input name="notes" defaultValue={p?.notes ?? ""} className={inputClass} placeholder="Optional" />
          </Field>
        </div>
      </div>
    );
  }

  return (
    <div className="print-hide rounded-2xl border border-black/[0.08] bg-white p-5 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="h-display text-base text-ink">
          <Wallet className="mr-1.5 inline h-4 w-4 text-ink/50" /> Owner payments
        </h3>
        <span className="text-xs text-ink/45">Shows on the invoice PDF</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-black/[0.06] bg-black/[0.015] px-3 py-2">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink/40">Owner pays</span>
          <span className="h-display text-base text-ink">{money(ownerTotal)}</span>
        </div>
        <div className="rounded-xl border border-black/[0.06] bg-black/[0.015] px-3 py-2">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink/40">Paid so far</span>
          <span className="h-display text-base text-ink">{money(paidToDate)}</span>
        </div>
        <div
          className={cx(
            "rounded-xl border px-3 py-2",
            fullyPaid ? "border-primary/30 bg-primary/[0.08]" : "border-amber-400/40 bg-amber-50"
          )}
        >
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink/40">
            {fullyPaid ? "Fully paid" : "Owner still owes"}
          </span>
          <span className={cx("h-display text-base", fullyPaid ? "text-primary" : "text-amber-700")}>
            {money(balance)}
          </span>
        </div>
      </div>

      {partial && (
        <p className="mb-3 rounded-xl border border-amber-400/40 bg-amber-50 px-3.5 py-2 text-sm text-amber-800">
          Partially paid — {money(paidToDate)} of {money(ownerTotal)}.
        </p>
      )}
      {error && (
        <p className="mb-3 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-sm text-red-600">{error}</p>
      )}

      {payments.length === 0 ? (
        <p className="text-sm text-ink/50">No payments recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {payments.map((p) =>
            editingId === p.id ? (
              <li key={p.id} className="rounded-xl border border-black/[0.08] p-3">
                <form onSubmit={(e) => submit(e, updateAction, p.id)} className="space-y-3">
                  <Fields p={p} />
                  <div className="flex gap-2">
                    <button type="submit" disabled={pending} className={buttonClass("primary") + " !py-1.5 !text-xs"}>
                      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className={buttonClass("ghost") + " !py-1.5 !text-xs"}>
                      Cancel
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/[0.06] bg-black/[0.015] px-3.5 py-2.5"
              >
                <span className="text-sm text-ink/80">
                  <span className="font-semibold text-ink">{money(Number(p.amount))}</span>
                  {" · "}
                  {fmtDate(p.paid_at)}
                  {p.method ? ` · ${p.method}` : ""}
                  {p.deducted_from_payment_id ? " · from rent payout" : ""}
                  {p.notes ? <span className="block text-xs text-ink/50">{p.notes}</span> : null}
                </span>
                {canManage && (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(p.id)}
                      aria-label="Edit payment"
                      className="rounded-lg p-1.5 text-ink/45 transition hover:bg-black/[0.04] hover:text-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      disabled={pending}
                      aria-label="Remove payment"
                      className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </li>
            )
          )}
        </ul>
      )}

      {canManage && (
        <div className="mt-3">
          {adding ? (
            <form onSubmit={(e) => submit(e, addAction)} className="space-y-3 rounded-xl border border-black/[0.08] p-3">
              <Fields />
              <div className="flex gap-2">
                <button type="submit" disabled={pending} className={buttonClass("primary") + " !py-1.5 !text-xs"}>
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Record payment
                </button>
                <button type="button" onClick={() => setAdding(false)} className={buttonClass("ghost") + " !py-1.5 !text-xs"}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className={buttonClass("ghost") + " !py-1.5 !text-xs"}>
              <Plus className="h-3.5 w-3.5" /> Add payment
            </button>
          )}
        </div>
      )}
    </div>
  );
}
