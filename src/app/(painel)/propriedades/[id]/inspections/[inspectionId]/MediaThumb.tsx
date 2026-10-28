"use client";

import { Film, ImageOff, Maximize2 } from "lucide-react";
import type { InspectionMedia } from "@/lib/inspections";

// Miniatura de uma foto/vídeo da inspeção (URL assinada; bucket privado).
// Toque abre o arquivo em tamanho real numa aba nova.
// Vídeo usa object-contain (barras pretas): vídeo de celular é EM PÉ e o
// object-cover num quadrado cortava em cima e embaixo no laptop (Andrea
// 2026-10-23: "when opening the video on the laptop, its cut off").
export function MediaThumb({ media, url }: { media: InspectionMedia; url: string | null }) {
  if (!url) {
    return (
      <div className="grid aspect-square w-full place-items-center rounded-xl bg-black/[0.05] text-ink/35">
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }
  if (media.kind === "video") {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
        <video src={url} preload="metadata" controls playsInline className="h-full w-full object-contain" />
        <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          <Film className="h-3 w-3" /> Video
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open video full size"
          className="absolute bottom-12 right-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-black/80"
        >
          <Maximize2 className="h-3 w-3" /> Full size
        </a>
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={media.caption || "Inspection photo"}
        className="aspect-square w-full rounded-xl bg-black/[0.04] object-cover"
      />
    </a>
  );
}
