"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { X, Download, Loader2, FileText } from "lucide-react";
import type { Document } from "@/lib/types";

// Janela (modal central) de PREVIEW de um documento — abre DENTRO do portal, sem
// nova aba. Segue o padrão window-means-modal (createPortal no body, backdrop, X,
// Esc). O bucket é PRIVADO: gera uma signed URL na hora (sessão do usuário) e
// renderiza inline por tipo (PDF em iframe, imagem em <img>, vídeo em <video>).
// Um botão Download baixa o arquivo com o nome certo (Content-Disposition).
export function DocumentPreview({ doc, onClose }: { doc: Document; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  // Signed URL pra visualização (10 min) — regenerada a cada abertura.
  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_url, 600);
      if (!active) return;
      if (error || !data?.signedUrl) setErr(error?.message ?? "Could not load this file.");
      else setUrl(data.signedUrl);
    })();
    return () => {
      active = false;
    };
  }, [doc.file_url]);

  // Fecha no Esc + trava o scroll do body enquanto aberta.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function download() {
    const supabase = createClient();
    const { data } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_url, 60, { download: doc.file_name });
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const ct = (doc.content_type ?? "").toLowerCase();
  const kind =
    ct === "application/pdf"
      ? "pdf"
      : ct.startsWith("image/")
      ? "image"
      : ct.startsWith("video/")
      ? "video"
      : "other";

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-black/[0.08] px-5 py-3">
          <p className="truncate text-sm font-semibold text-ink">{doc.file_name}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={download}
              className="inline-flex items-center gap-2 rounded-xl border border-black/[0.10] bg-white px-3 py-1.5 text-sm text-ink/80 transition hover:bg-black/[0.03]"
            >
              <Download className="h-4 w-4" /> Download
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-ink/60 transition hover:bg-black/[0.05]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-black/[0.03]">
          {err ? (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-red-600">{err}</div>
          ) : !url ? (
            <div className="grid h-full place-items-center text-ink/50">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : kind === "pdf" ? (
            <iframe src={url} className="h-full w-full" title={doc.file_name} />
          ) : kind === "image" ? (
            <div className="grid h-full place-items-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={doc.file_name} className="max-h-full max-w-full object-contain" />
            </div>
          ) : kind === "video" ? (
            <div className="grid h-full place-items-center p-4">
              <video src={url} controls className="max-h-full max-w-full" />
            </div>
          ) : (
            <div className="grid h-full place-items-center gap-3 p-6 text-center text-ink/60">
              <FileText className="h-10 w-10 text-ink/30" />
              <p className="text-sm">This file type can&apos;t be previewed here.</p>
              <button
                type="button"
                onClick={download}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
              >
                <Download className="h-4 w-4" /> Download to open
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
