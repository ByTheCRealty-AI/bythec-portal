"use client";

// =============================================================================
// OwnerPayoutControl — repasse ao owner de UM aluguel recebido (rent_collection
// = 'bythec'). Espelha o PayoutRow do invoice de temporada: compacto até marcar
// "Owner paid" (checkbox); ao marcar, expande método → nº do eCheck (só eCheck) →
// recibo (opcional, category='owner_payout'). Reusado na linha de pagamento
// (sub-linha expansível) e na aba "Owner payouts" (agrupada por owner).
// =============================================================================

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Wallet, Upload, Loader2, FileText, Trash2, ExternalLink } from "lucide-react";
import { money } from "@/lib/format";
import type { Payment, PaymentAttachment } from "@/lib/types";

const METHODS = ["eCheck", "Zelle", "Cash", "Other"];
const MAX_BYTES = 25 * 1024 * 1024;

function safeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "");
  return cleaned || "file";
}

// Valor que a By the C deve ao owner nesse mês ≈ rent − commission.
export function ownerOwed(p: Payment): number {
  const rent = Number(p.rent_amount ?? 0);
  const commission = Number(p.commission ?? 0);
  return Math.max(0, rent - commission);
}

function ReceiptRow({
  att,
  paymentId,
  canManage,
  deleteReceipt,
}: {
  att: PaymentAttachment;
  paymentId: string;
  canManage: boolean;
  deleteReceipt: (fd: FormData) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    setBusy(true);
    try {
      if (/^https?:\/\//i.test(att.file_url)) {
        window.open(att.file_url, "_blank", "noopener,noreferrer");
      } else {
        const supabase = createClient();
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
    fd.set("payment_id", paymentId);
    fd.set("file_url", att.file_url);
    start(async () => {
      try {
        await deleteReceipt(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove. Try again.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5">
      <FileText className="h-3.5 w-3.5 text-ink/45" />
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="flex-1 truncate text-left text-xs text-ink hover:text-primary"
      >
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

export type OwnerPayoutActions = {
  setOwnerPaid: (id: string, paid: boolean) => Promise<void>;
  setOwnerMethod: (id: string, method: string | null) => Promise<void>;
  setOwnerCheckNumber: (id: string, checkNumber: string | null) => Promise<void>;
  addReceipt: (fd: FormData) => Promise<void>;
  deleteReceipt: (fd: FormData) => Promise<void>;
};

export function OwnerPayoutControl({
  payment,
  canManage,
  actions,
}: {
  payment: Payment;
  canManage: boolean;
  actions: OwnerPayoutActions;
}) {
  const paymentId = payment.id;
  const paid = payment.owner_paid;
  const receipts = (payment.attachments ?? []).filter((a) => a.category === "owner_payout");

  const [pending, start] = useTransition();
  const [localMethod, setLocalMethod] = useState<string>(payment.owner_payment_method ?? "");
  const [localCheck, setLocalCheck] = useState<string>(payment.owner_check_number ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isECheck = localMethod === "eCheck";

  function togglePaid() {
    setError(null);
    start(async () => {
      try {
        await actions.setOwnerPaid(paymentId, !paid);
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
        await actions.setOwnerMethod(paymentId, value || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the method.");
      }
    });
  }

  function saveCheck() {
    const v = localCheck.trim();
    if ((payment.owner_check_number ?? "") === v) return;
    setError(null);
    start(async () => {
      try {
        await actions.setOwnerCheckNumber(paymentId, v || null);
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
      const path = `owner-payouts/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
      const fd = new FormData();
      fd.set("payment_id", paymentId);
      fd.set("file_url", path);
      fd.set("file_name", file.name);
      fd.set("content_type", file.type || "");
      await actions.addReceipt(fd);
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
          <p className="text-sm font-semibold text-ink">
            <Wallet className="mr-1 inline h-4 w-4 text-ink/50" /> Owner payout
          </p>
          <p className="text-xs text-ink/55">Owner’s share · {money(ownerOwed(payment))}</p>
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
              Owner paid
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

          {isECheck && (
            <div>
              <label className="mb-1 block text-xs text-ink/55">eCheck number</label>
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
                  <ReceiptRow
                    key={att.id}
                    att={att}
                    paymentId={paymentId}
                    canManage={canManage}
                    deleteReceipt={actions.deleteReceipt}
                  />
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
          <p className="mt-2 text-xs italic text-ink/45">Check the box to record how you paid the owner.</p>
        )
      )}

      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
