"use client";

// =============================================================================
// InvoiceDocuments — anexa recibos (PDF/imagem) a uma invoice e baixa o PDF
// COMBINADO (invoice + recibos) já nomeado "Invoice ### (endereço).pdf".
// =============================================================================
// Substitui o passo manual (baixar invoice + baixar recibo + Foxit merge +
// renomear + salvar). A Andrea sobe o arquivo combinado direto no eDeluxe.
// Escondido na impressão (.print-hide) — é controle de gestão, não parte da folha.

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonClass } from "@/components/ui";
import { FileText, Upload, Loader2, Trash2, Download, ExternalLink } from "lucide-react";
import type { InvoiceAttachment } from "@/lib/types";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB por arquivo

function safeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "");
  return cleaned || "file";
}

function AttachmentRow({
  att,
  invoiceId,
  canManage,
  deleteAction,
}: {
  att: InvoiceAttachment;
  invoiceId: string;
  canManage: boolean;
  deleteAction: (fd: FormData) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const isHttp = /^https?:\/\//i.test(att.file_url);
      if (isHttp) {
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
    setError(null);
    const fd = new FormData();
    fd.set("id", att.id);
    fd.set("invoice_id", invoiceId);
    start(async () => {
      try {
        await deleteAction(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove. Try again.");
      }
    });
  }

  const isPdf = (att.content_type ?? "").includes("pdf") || (att.file_name ?? "").toLowerCase().endsWith(".pdf");

  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5">
      <FileText className={isPdf ? "h-4 w-4 text-red-500" : "h-4 w-4 text-ink/45"} />
      <button type="button" onClick={open} disabled={busy} className="flex-1 truncate text-left text-sm text-ink hover:text-primary">
        {busy ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}
        {att.file_name ?? "Attachment"}
        <ExternalLink className="ml-1 inline h-3 w-3 text-ink/30" />
      </button>
      {canManage && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="grid h-7 w-7 place-items-center rounded-lg border border-black/[0.08] text-ink/40 transition hover:border-red-300 hover:text-red-500 disabled:opacity-60"
          aria-label="Remove attachment"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

export function InvoiceDocuments({
  invoiceId,
  attachments,
  canManage,
  addAction,
  deleteAction,
}: {
  invoiceId: string;
  attachments: InvoiceAttachment[];
  canManage: boolean;
  addAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      for (const file of files) {
        if (file.size > MAX_BYTES) {
          setError(`${file.name} is too large. Maximum size is 25 MB.`);
          continue;
        }
        const path = `invoice-receipts/${crypto.randomUUID()}-${safeName(file.name)}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
        if (upErr) {
          setError(`Upload failed for ${file.name}: ${upErr.message}`);
          continue;
        }
        const fd = new FormData();
        fd.set("invoice_id", invoiceId);
        fd.set("file_url", path);
        fd.set("file_name", file.name);
        fd.set("content_type", file.type || "");
        await addAction(fd);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="print-hide mt-6 rounded-2xl border border-black/[0.08] bg-white p-5 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="h-display text-base text-ink">Receipts &amp; documents</h3>
          <p className="text-xs text-ink/55">
            Attach the Airbnb / VRBO and Stripe PDFs. They merge into the combined download below.
          </p>
        </div>
        <a
          href={`/invoices/${invoiceId}/combined-pdf`}
          className={buttonClass("primary")}
        >
          <Download className="h-4 w-4" /> Download invoice + receipts
        </a>
      </div>

      {attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((att) => (
            <AttachmentRow
              key={att.id}
              att={att}
              invoiceId={invoiceId}
              canManage={canManage}
              deleteAction={deleteAction}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink/45">No documents attached yet.</p>
      )}

      {canManage && (
        <div className="mt-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/[0.06] px-3 py-2 text-sm font-semibold text-primary transition hover:border-primary/50 hover:bg-primary/[0.10]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy ? "Uploading…" : "Attach PDF / image"}
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={onPick}
              className="hidden"
              disabled={busy}
            />
          </label>
          {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
