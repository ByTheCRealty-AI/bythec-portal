"use client";

// =============================================================================
// DepositReceivedControl — gerência do recebimento de UMA parcela de security
// deposit (a parcela NÃO usa payment_parts). Painel que expande dentro do card
// do depósito. Dois estados:
//   • Ainda due  → formulário "Mark received": recibo OBRIGATÓRIO + data em que
//     caiu (default hoje). Sobe o recibo client-side e chama markReceived.
//   • Já received → data editável (setReceivedDate), lista de recibos (abrir/
//     excluir), "Add another" e "Mark as due" (reverte via setStatus).
// Espelha OwnerPayoutControl (upload/recibo) + FullPaymentControl (recibo exigido)
// + o editor de data da comissão.
// =============================================================================

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, Loader2, FileText, Trash2, ExternalLink, CheckCircle2, Undo2 } from "lucide-react";
import { uploadReceipts, todayNY } from "./RentInstallmentsPanel";
import type { Payment, PaymentAttachment, PaymentStatus } from "@/lib/types";

const MAX_BYTES = 25 * 1024 * 1024;

export type DepositActions = {
  markReceived: (fd: FormData) => void | Promise<void>;
  setReceivedDate: (id: string, dateStr: string | null) => Promise<void>;
  addReceipt: (fd: FormData) => void | Promise<void>;
  deleteReceipt: (fd: FormData) => void | Promise<void>;
};

function safeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "");
  return cleaned || "file";
}

// ISO (timestamptz) -> YYYY-MM-DD no fuso de NY, pro <input type="date">.
function isoToDateNY(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function DepositReceiptRow({
  att,
  paymentId,
  canManage,
  deleteReceipt,
}: {
  att: PaymentAttachment;
  paymentId: string;
  canManage: boolean;
  deleteReceipt: (fd: FormData) => void | Promise<void>;
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

export function DepositReceivedControl({
  payment,
  canManage,
  actions,
  setStatus,
  onDone,
}: {
  payment: Payment;
  canManage: boolean;
  actions: DepositActions;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  onDone: () => void;
}) {
  const paymentId = payment.id;
  const received = payment.status === "received";
  // Um depósito não tem repasse ao owner; todo anexo dele é recibo do inquilino.
  const receipts = (payment.attachments ?? []).filter((a) => a.category !== "owner_payout");

  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado "due": formulário de mark received (recibo exigido + data).
  const fileRef = useRef<HTMLInputElement>(null);
  const [hasFile, setHasFile] = useState(false);
  const [markDate, setMarkDate] = useState<string>(todayNY());

  // Estado "received": data editável.
  const [localDate, setLocalDate] = useState<string>(isoToDateNY(payment.received_at));
  const addFileRef = useRef<HTMLInputElement>(null);

  const inputClass =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15 disabled:opacity-60";

  async function markReceived(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const files = Array.from(fileRef.current?.files ?? []);
    if (!files.length) {
      setError("Attach a receipt to mark this deposit received.");
      return;
    }
    setBusy(true);
    try {
      const refs = await uploadReceipts(files);
      const fd = new FormData();
      fd.set("id", paymentId);
      fd.set("property_id", payment.property_id);
      fd.set("received_at", markDate);
      fd.set("receipts_json", JSON.stringify(refs));
      await actions.markReceived(fd);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  function saveDate(value: string) {
    setLocalDate(value);
    if (!value) return;
    setError(null);
    start(async () => {
      try {
        await actions.setReceivedDate(paymentId, value);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the date.");
      }
    });
  }

  function revertToDue() {
    setError(null);
    start(async () => {
      try {
        await setStatus(paymentId, "due");
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update. Try again.");
      }
    });
  }

  async function addAnother(e: React.ChangeEvent<HTMLInputElement>) {
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
      const path = `payment-receipts/${crypto.randomUUID()}-${safeName(file.name)}`;
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
      if (addFileRef.current) addFileRef.current.value = "";
    }
  }

  // ---- Estado: ainda due → mark received (recibo obrigatório) ----------------
  if (!received) {
    return (
      <form onSubmit={markReceived} className="space-y-4 rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-ink">Mark deposit received</p>
          <p className="text-xs text-ink/45">A receipt is required. Set the day it actually came in.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-ink/55">Date received</label>
            <input
              type="date"
              value={markDate}
              onChange={(e) => setMarkDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink/55">Receipt (required)</label>
            <input
              ref={fileRef}
              type="file"
              multiple
              required
              accept="image/*,application/pdf"
              onChange={(e) => setHasFile((e.target.files?.length ?? 0) > 0)}
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-ink/40">Image, HEIC, or PDF. Up to 25 MB each.</p>
          </div>
        </div>
        {error && (
          <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !hasFile}
            className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-4 py-2.5 text-sm font-semibold text-primary transition hover:border-primary/50 hover:bg-primary/[0.10] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {busy ? "Saving…" : "Mark received"}
          </button>
          <button type="button" onClick={onDone} className="text-xs font-semibold text-ink/55 hover:text-ink">
            Cancel
          </button>
        </div>
      </form>
    );
  }

  // ---- Estado: já received → data editável + recibos -------------------------
  return (
    <div className="space-y-3 rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <CheckCircle2 className="h-4 w-4" /> Received
        </span>
        {canManage && (
          <button
            type="button"
            onClick={revertToDue}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.10] bg-white px-3 py-2 text-xs font-semibold text-ink/65 transition hover:border-secondary/40 hover:text-secondary disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
            Mark as due
          </button>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs text-ink/55">Date received</label>
        <input
          type="date"
          value={localDate}
          onChange={(e) => saveDate(e.target.value)}
          disabled={!canManage || pending}
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-ink/55">Receipt</label>
        {receipts.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {receipts.map((att) => (
              <DepositReceiptRow
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
            {busy ? "Uploading…" : receipts.length > 0 ? "Add another" : "Attach receipt"}
            <input
              ref={addFileRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={addAnother}
              className="hidden"
              disabled={busy}
            />
          </label>
        )}
      </div>

      {error && <p className="text-[12px] text-red-600">{error}</p>}

      <div className="pt-1">
        <button type="button" onClick={onDone} className="text-xs font-semibold text-ink/55 hover:text-ink">
          Done
        </button>
      </div>
    </div>
  );
}
