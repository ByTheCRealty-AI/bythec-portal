"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { date } from "@/lib/format";
import { FileText, FileImage, FileSpreadsheet, Download, Loader2 } from "lucide-react";
import { DeleteControl } from "./InlineRowControls";
import type { Document } from "@/lib/types";

// Linha de documento na aba Documents. O bucket é PRIVADO, então o download gera
// uma signed URL NA HORA do clique (browser client, sessão do usuário → Storage
// RLS aplica) e abre numa nova aba. Nunca persistimos signed URL nem construímos
// URL pública.

function iconFor(contentType: string | null) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("image/")) return <FileImage className="h-4 w-4" />;
  if (ct.includes("spreadsheet") || ct.includes("excel") || ct.includes("csv")) {
    return <FileSpreadsheet className="h-4 w-4" />;
  }
  return <FileText className="h-4 w-4" />;
}

function typeLabel(contentType: string | null): string {
  if (!contentType) return "File";
  const ct = contentType.toLowerCase();
  if (ct === "application/pdf") return "PDF";
  if (ct.startsWith("image/")) return ct.slice(6).toUpperCase();
  const sub = ct.split("/")[1];
  return sub ? sub.toUpperCase() : "File";
}

export function DocumentRow({
  doc,
  canDelete = false,
  deleteAction,
}: {
  doc: Document;
  canDelete?: boolean;
  // Recebe a action correta (cliente OU propriedade). Só usada se canDelete.
  deleteAction?: (fd: FormData) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error: sErr } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_url, 60);
      if (sErr || !data?.signedUrl) {
        setError(sErr?.message ?? "Could not generate a download link.");
        setBusy(false);
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-black/[0.07] bg-black/[0.015] p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {iconFor(doc.content_type)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{doc.file_name}</p>
          <p className="mt-0.5 text-xs text-ink/45">
            {typeLabel(doc.content_type)}
            {doc.year ? ` · ${doc.year}` : ""} · Added {date(doc.created_at)}
          </p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-black/[0.10] bg-white px-3.5 py-2 text-sm text-ink/80 transition-all duration-200 hover:border-black/20 hover:bg-black/[0.03] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download
        </button>
        {canDelete && deleteAction && (
          <DeleteControl
            action={deleteAction}
            hidden={{ id: doc.id, parent_id: doc.parent_id, file_url: doc.file_url }}
            noun="document"
          />
        )}
      </div>
    </li>
  );
}
