"use client";

// =============================================================================
// InvoicePayoutsPanel — controle INTERNO de repasse do invoice de temporada:
// como a By the C pagou o OWNER e o CLEANER (método + nº do cheque) + recibo.
// UX: cada payout fica COMPACTO até marcar "Paid" (checkbox). Ao marcar pago,
// expande os campos (método → nº do cheque se Check/eCheck → recibo).
// "Owner pago" REUSA o flag `paid` do invoice. "Cleaner pago" usa cleaner_paid.
// Recibos aqui têm category owner_payout / cleaner_payout — NÃO entram no PDF
// combinado (guest). Escondido na impressão.
// =============================================================================

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Wallet, Upload, Loader2, FileText, Trash2, ExternalLink } from "lucide-react";
import type { InvoiceAttachment } from "@/lib/types";
import {
  setPaid,
  setCleanerPaid,
  setOwnerPaymentMethod,
  setCleanerPaymentMethod,
  setOwnerCheckNumber,
  setCleanerCheckNumber,
  addInvoiceAttachmentAction,
  deleteInvoiceAttachmentAction,
} from "./actions";

const METHODS = ["eCheck", "Check", "Cash", "Zelle", "Stripe", "Other"];
const MAX_BYTES = 25 * 1024 * 1024;

function money(n: number | null): string {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function safeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "");
  return cleaned || "file";
}

function ReceiptRow({
  att,
  invoiceId,
  canManage,
}: {
  att: InvoiceAttachment;
  invoiceId: string;
  canManage: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      if (/^https?:\/\//i.test(att.file_url)) {
        window.open(att.file_url, "_blank", "noopener,noreferrer");
      } else {
        const { data, error: sErr } = await supabase.storage
          .from("documents")
          .createSignedUrl(att.file_url, 60);
        if (sErr || !data?.signedUrl) {
          setError(sErr?.message ?? "Could not open the file.");
          return;
        }
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      }
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    const fd = new FormData();
    fd.set("id", att.id);
    fd.set("invoice_id", invoiceId);
    start(async () => {
      try {
        await deleteInvoiceAttachmentAction(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove. Try again.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5">
      <FileText className="h-3.5 w-3.5 text-ink/45" />
      <button type="button" onClick={open} disabled={busy} className="flex-1 truncate text-left text-xs text-ink hover:text-primary">
        {busy ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
        {att.file_name ?? "Receipt"}
        <ExternalLink className="ml-1 inline h-3 w-3 text-ink/30" />
      </button>
      {canManage && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="grid h-6 w-6 place-items-center rounded-md border border-black/[0.08] text-ink/40 transition hover:border-red-300 hover:text-red-500 disabled:opacity-60"
          aria-label="Remove receipt"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </button>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

function PayoutRow({
  invoiceId,
  canManage,
  title,
  amountLabel,
  amount,
  paid,
  paidAtLabel,
  method,
  checkNumber,
  category,
  receipts,
  onTogglePaid,
  onSetMethod,
  onSetCheckNumber,
}: {
  invoiceId: string;
  canManage: boolean;
  title: string;
  amountLabel: string;
  amount: number | null;
  paid: boolean;
  paidAtLabel: string | null;
  method: string | null;
  checkNumber: string | null;
  category: "owner_payout" | "cleaner_payout";
  receipts: InvoiceAttachment[];
  onTogglePaid: () => Promise<void>;
  onSetMethod: (m: string | null) => Promise<void>;
  onSetCheckNumber: (v: string | null) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [localMethod, setLocalMethod] = useState<string>(method ?? "");
  const [localCheck, setLocalCheck] = useState<string>(checkNumber ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCheckLike = localMethod === "Check" || localMethod === "eCheck";

  function togglePaid() {
    setError(null);
    start(async () => {
      try {
        await onTogglePaid();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save. Try again.");
      }
    });
  }

  function changeMethod(value: string) {
    setLocalMethod(value);
    setError(null);
    start(async () => {
      try {
        await onSetMethod(value || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the method.");
      }
    });
  }

  function saveCheck() {
    const v = localCheck.trim();
    if ((checkNumber ?? "") === v) return; // nada mudou
    setError(null);
    start(async () => {
      try {
        await onSetCheckNumber(v || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the check number.");
      }
    });
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("File is too large. Maximum size is 25 MB.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const path = `invoice-payouts/${category}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
      const fd = new FormData();
      fd.set("invoice_id", invoiceId);
      fd.set("file_url", path);
      fd.set("file_name", file.name);
      fd.set("content_type", file.type || "");
      fd.set("category", category);
      await addInvoiceAttachmentAction(fd);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const inputClass =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15 disabled:opacity-60";

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs text-ink/55">
            {amountLabel} · {money(amount)}
          </p>
        </div>
        {canManage ? (
          <label className="inline-flex cursor-pointer select-none items-center gap-2">
            <input
              type="checkbox"
              checked={paid}
              disabled={pending}
              onChange={togglePaid}
              className="h-4 w-4 rounded border-black/25 text-primary focus:ring-primary/30"
            />
            <span className={paid ? "text-sm font-semibold text-primary" : "text-sm font-medium text-ink/60"}>
              Paid{paid && paidAtLabel ? ` · ${paidAtLabel}` : ""}
            </span>
          </label>
        ) : paid ? (
          <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            Paid
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-secondary/25 bg-secondary/10 px-2.5 py-0.5 text-xs font-semibold text-secondary">
            Unpaid
          </span>
        )}
      </div>

      {paid ? (
        <div className="mt-3 grid gap-3 border-t border-black/[0.06] pt-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-ink/55">How paid</label>
            <select
              value={localMethod}
              onChange={(e) => changeMethod(e.target.value)}
              disabled={!canManage || pending}
              className={inputClass}
            >
              <option value="">Select method…</option>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {isCheckLike && (
            <div>
              <label className="mb-1 block text-xs text-ink/55">Check number</label>
              <input
                type="text"
                value={localCheck}
                onChange={(e) => setLocalCheck(e.target.value)}
                onBlur={saveCheck}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                disabled={!canManage || pending}
                placeholder="e.g. 1042"
                className={inputClass}
              />
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink/55">Receipt</label>
            {receipts.length > 0 && (
              <div className="mb-2 space-y-1.5">
                {receipts.map((att) => (
                  <ReceiptRow key={att.id} att={att} invoiceId={invoiceId} canManage={canManage} />
                ))}
              </div>
            )}
            {canManage && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-black/15 bg-black/[0.02] px-3 py-2 text-xs font-semibold text-ink/70 transition hover:border-black/30 hover:text-ink">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {busy ? "Uploading…" : receipts.length > 0 ? "Add another" : "Attach (optional)"}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={onPick}
                  className="hidden"
                  disabled={busy}
                />
              </label>
            )}
          </div>
        </div>
      ) : (
        canManage && (
          <p className="mt-2 text-xs italic text-ink/45">Check the box to record how you paid.</p>
        )
      )}

      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}

export function InvoicePayoutsPanel({
  invoiceId,
  canManage,
  ownerPaid,
  ownerPaidDate,
  ownerAmount,
  ownerMethod,
  ownerCheckNumber,
  ownerReceipts,
  cleaningToBythec,
  cleanerPaid,
  cleanerAmount,
  cleanerMethod,
  cleanerCheckNumber,
  cleanerReceipts,
}: {
  invoiceId: string;
  canManage: boolean;
  ownerPaid: boolean;
  ownerPaidDate: string | null;
  ownerAmount: number | null;
  ownerMethod: string | null;
  ownerCheckNumber: string | null;
  ownerReceipts: InvoiceAttachment[];
  cleaningToBythec: boolean;
  cleanerPaid: boolean;
  cleanerAmount: number | null;
  cleanerMethod: string | null;
  cleanerCheckNumber: string | null;
  cleanerReceipts: InvoiceAttachment[];
}) {
  return (
    <div className="print-hide rounded-2xl border border-black/[0.08] bg-white p-5 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="h-display text-base text-ink">
          <Wallet className="mr-1.5 inline h-4 w-4 text-ink/50" /> Payouts
        </h3>
        <span className="text-xs text-ink/45">Internal · not on the invoice PDF</span>
      </div>

      <div className="space-y-3">
        <PayoutRow
          invoiceId={invoiceId}
          canManage={canManage}
          title="Owner payout"
          amountLabel="Total received by owner"
          amount={ownerAmount}
          paid={ownerPaid}
          paidAtLabel={ownerPaidDate}
          method={ownerMethod}
          checkNumber={ownerCheckNumber}
          category="owner_payout"
          receipts={ownerReceipts}
          onTogglePaid={() => setPaid(invoiceId, !ownerPaid)}
          onSetMethod={(m) => setOwnerPaymentMethod(invoiceId, m)}
          onSetCheckNumber={(v) => setOwnerCheckNumber(invoiceId, v)}
        />

        {cleaningToBythec && (
          <PayoutRow
            invoiceId={invoiceId}
            canManage={canManage}
            title="Cleaner payout"
            amountLabel="Cleaning fee (By the C)"
            amount={cleanerAmount}
            paid={cleanerPaid}
            paidAtLabel={null}
            method={cleanerMethod}
            checkNumber={cleanerCheckNumber}
            category="cleaner_payout"
            receipts={cleanerReceipts}
            onTogglePaid={() => setCleanerPaid(invoiceId, !cleanerPaid)}
            onSetMethod={(m) => setCleanerPaymentMethod(invoiceId, m)}
            onSetCheckNumber={(v) => setCleanerCheckNumber(invoiceId, v)}
          />
        )}
      </div>
    </div>
  );
}
