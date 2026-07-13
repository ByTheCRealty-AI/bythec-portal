"use client";

// =============================================================================
// RentInstallmentsPanel — registra e mostra os pagamentos PARCIAIS de um aluguel
// (monthly / first_month / last_month). Progresso + lista de parcelas (cada uma
// com seus comprovantes) + form pra registrar uma nova parcela com upload de N
// recibos de qualquer mídia (inclusive o recibo de papel do cash).
// =============================================================================
// Reusado na aba Due e na aba Monthly. O pai vira "Received" quando a soma fecha
// o rent_amount (regra de caixa). Render só aparece pra quem pode gerir (canManage).

import { useRef, useState, useTransition } from "react";
import { money, date, cx } from "@/lib/format";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { PaymentReceipt } from "./PaymentReceipt";
import { PAYMENT_METHODS, type Payment, type PaymentPart } from "@/lib/types";
import { Plus, Loader2, Pencil, Trash2, X, Upload } from "lucide-react";

const MAX_RECEIPT_BYTES = 25 * 1024 * 1024; // 25 MB por arquivo

function safeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "");
  return cleaned || "file";
}

// Sobe N arquivos pro bucket privado `documents` (client-side, pro Storage RLS
// usar a sessão) e devolve as referências pra gravar em payment_attachments.
// Exportado: reusado pelo "Mark paid in full" (PaymentEntryButton), que exige recibo.
export async function uploadReceipts(
  files: File[]
): Promise<{ url: string; name: string; type: string }[]> {
  if (!files.length) return [];
  const supabase = createClient();
  const refs: { url: string; name: string; type: string }[] = [];
  for (const file of files) {
    if (file.size > MAX_RECEIPT_BYTES) {
      throw new Error(`${file.name} is too large. Maximum size is 25 MB.`);
    }
    const path = `payment-receipts/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error } = await supabase.storage.from("documents").upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (error) throw new Error(`Receipt upload failed: ${error.message}`);
    refs.push({ url: path, name: file.name, type: file.type || "" });
  }
  return refs;
}

// "Hoje" em America/New_York como YYYY-MM-DD, pra pré-preencher a data. Exportado.
export function todayNY(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function RentInstallmentsPanel({
  payment,
  canManage,
  addPartAction,
  updatePartAction,
  deletePartAction,
}: {
  payment: Payment;
  canManage: boolean;
  addPartAction: (fd: FormData) => void | Promise<void>;
  updatePartAction: (fd: FormData) => void | Promise<void>;
  deletePartAction: (fd: FormData) => void | Promise<void>;
}) {
  const parts = (payment.parts ?? [])
    .slice()
    .sort((a, b) => (a.paid_at ?? "").localeCompare(b.paid_at ?? ""));
  const rent = payment.rent_amount ?? 0;
  const fullyPaid = payment.status === "received";
  const rawPaid =
    payment.amount_paid ?? parts.reduce((s, p) => s + (p.amount ?? 0), 0);
  // A received rent is fully paid even if it has no itemized parts (one-shot
  // "Mark received" or legacy data) — show it as complete rather than $0.
  const paid = fullyPaid ? Math.max(rawPaid, rent) : rawPaid;
  const remaining = Math.max(0, rent - paid);
  const pct = fullyPaid ? 100 : rent > 0 ? Math.min(100, Math.round((rawPaid / rent) * 100)) : 0;

  return (
    <div className="space-y-4">
      {/* Progresso */}
      <div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink/60">{money(paid)} paid</span>
          <span className={cx("font-semibold", fullyPaid ? "text-primary" : "text-amber-600")}>
            {fullyPaid ? "Paid in full" : `${money(remaining)} remaining`}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/[0.06]">
          <div
            className={cx("h-full rounded-full", fullyPaid ? "bg-primary" : "bg-amber-500")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Lista de parcelas */}
      {parts.length > 0 ? (
        <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white">
          {parts.map((part, i) => (
            <PartRow
              key={part.id}
              part={part}
              index={i}
              propertyId={payment.property_id}
              canManage={canManage}
              updatePartAction={updatePartAction}
              deletePartAction={deletePartAction}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink/45">No payments logged yet.</p>
      )}

      {/* Registrar pagamento */}
      {canManage && (
        <RecordPaymentForm
          paymentId={payment.id}
          propertyId={payment.property_id}
          defaultAmount={remaining > 0 ? remaining : null}
          addPartAction={addPartAction}
        />
      )}
    </div>
  );
}

// Uma parcela: valor · método · data + comprovantes. Edição inline + delete.
function PartRow({
  part,
  index,
  propertyId,
  canManage,
  updatePartAction,
  deletePartAction,
}: {
  part: PaymentPart;
  index: number;
  propertyId: string;
  canManage: boolean;
  updatePartAction: (fd: FormData) => void | Promise<void>;
  deletePartAction: (fd: FormData) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const attachments = part.attachments ?? [];

  if (editing && canManage) {
    return (
      <li className="bg-primary/[0.03] px-4 py-4">
        <EditPartForm
          part={part}
          propertyId={propertyId}
          updatePartAction={updatePartAction}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {index + 1}
      </span>
      <div className="min-w-[120px] flex-1">
        <div className="text-sm font-semibold text-ink">
          {money(part.amount)}
          {part.method && <span className="font-normal text-ink/55"> · {part.method}</span>}
        </div>
        <div className="text-xs text-ink/50">{date(part.paid_at)}</div>
        {part.notes && <div className="text-xs text-ink/45">{part.notes}</div>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {attachments.length > 0 ? (
          attachments.map((a) => <PaymentReceipt key={a.id} attachment={a} />)
        ) : (
          <span className="text-xs text-ink/30">No receipt</span>
        )}
        {canManage && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-black/[0.10] bg-white px-2 py-1.5 text-xs font-semibold text-ink/70 transition hover:border-primary/40 hover:text-primary"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <DeletePart
              partId={part.id}
              paymentId={part.payment_id}
              propertyId={propertyId}
              deletePartAction={deletePartAction}
            />
          </>
        )}
      </div>
    </li>
  );
}

function DeletePart({
  partId,
  paymentId,
  propertyId,
  deletePartAction,
}: {
  partId: string;
  paymentId: string;
  propertyId: string;
  deletePartAction: (fd: FormData) => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    const fd = new FormData();
    fd.set("id", partId);
    fd.set("payment_id", paymentId);
    fd.set("property_id", propertyId);
    start(async () => {
      try {
        await deletePartAction(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete. Try again.");
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-red-600 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        Delete payment
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg border border-black/[0.10] bg-white px-2 py-1.5 text-xs font-semibold text-ink/60 hover:bg-black/[0.03]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

// Form de edição de uma parcela (valor/data/método/notas + anexar mais recibos).
function EditPartForm({
  part,
  propertyId,
  updatePartAction,
  onDone,
}: {
  part: PaymentPart;
  propertyId: string;
  updatePartAction: (fd: FormData) => void | Promise<void>;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const files = Array.from(fileRef.current?.files ?? []);
      const refs = await uploadReceipts(files);
      const fd = new FormData(e.currentTarget);
      fd.delete("receipt_files");
      fd.set("receipts_json", JSON.stringify(refs));
      await updatePartAction(fd);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="id" value={part.id} />
      <input type="hidden" name="payment_id" value={part.payment_id} />
      <input type="hidden" name="property_id" value={propertyId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Amount (USD)">
          <input
            name="amount"
            type="number"
            step="0.01"
            min={0}
            defaultValue={part.amount ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Date">
          <input name="paid_at" type="date" defaultValue={part.paid_at ?? ""} className={inputClass} />
        </Field>
        <Field label="Method">
          <select name="method" defaultValue={part.method ?? "Zelle"} className={inputClass}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notes">
        <input name="notes" type="text" defaultValue={part.notes ?? ""} className={inputClass} placeholder="Optional" />
      </Field>
      <Field label="Add more receipts (optional)" hint="Images, HEIC, or PDF. Up to 25 MB each.">
        <input ref={fileRef} name="receipt_files" type="file" multiple accept="image/*,application/pdf" className={inputClass} />
      </Field>
      {error && <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className={buttonClass("primary")}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            "Save payment"
          )}
        </button>
        <button type="button" onClick={onDone} disabled={busy} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// Form pra registrar uma nova parcela. Toggle aberto/fechado. Upload de N recibos.
function RecordPaymentForm({
  paymentId,
  propertyId,
  defaultAmount,
  addPartAction,
}: {
  paymentId: string;
  propertyId: string;
  defaultAmount: number | null;
  addPartAction: (fd: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = e.currentTarget;
    try {
      const files = Array.from(fileRef.current?.files ?? []);
      const refs = await uploadReceipts(files);
      const fd = new FormData(form);
      fd.delete("receipt_files");
      fd.set("receipts_json", JSON.stringify(refs));
      await addPartAction(fd);
      form.reset();
      setOpen(false);
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/[0.06] px-3 py-2 text-sm font-semibold text-primary transition hover:border-primary/50 hover:bg-primary/[0.10]"
      >
        <Plus className="h-4 w-4" /> Record a payment
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="property_id" value={propertyId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Amount (USD)">
          <input
            name="amount"
            type="number"
            step="0.01"
            min={0}
            defaultValue={defaultAmount != null ? String(defaultAmount) : ""}
            className={inputClass}
            placeholder="0.00"
          />
        </Field>
        <Field label="Date">
          <input name="paid_at" type="date" defaultValue={todayNY()} className={inputClass} />
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
      </div>
      <Field label="Notes">
        <input name="notes" type="text" className={inputClass} placeholder="Optional — e.g. partial, agreed plan" />
      </Field>
      <Field
        label="Receipts (optional)"
        hint="Images, HEIC, or PDF — add as many as you like. For cash, snap the paper receipt."
      >
        <input
          ref={fileRef}
          name="receipt_files"
          type="file"
          multiple
          accept="image/*,application/pdf"
          className={inputClass}
        />
      </Field>
      {error && <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className={buttonClass("primary")}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> Save payment
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={busy}
          className={buttonClass("ghost")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
