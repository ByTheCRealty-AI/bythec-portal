"use client";

// =============================================================================
// Gravador de vídeo DENTRO do portal (inspeção).
// =============================================================================
// Por que existe: no iPhone, <input capture> pra vídeo abre a câmera do sistema
// numa qualidade BAIXA que o site não consegue mudar (Andrea 2026-10-23: "when
// taking a video the quality is horrible but when i upload a video, the quality
// is good"). Aqui o próprio portal grava: getUserMedia pedindo 1080p na câmera
// traseira + MediaRecorder com bitrate alto.
//
// Teto: 50 MB por arquivo (limite do storage no plano atual). A gravação para
// sozinha um pouco antes, e o timer mostra quanto falta.
// Sem suporte (navegador antigo / permissão negada)? O componente avisa e o
// botão Video volta pro seletor de arquivo do sistema (ver isRecorderSupported).
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Circle, Loader2, Square, X } from "lucide-react";

const MAX_BYTES = 46 * 1024 * 1024; // para antes dos 50 MB do storage
const VIDEO_BPS = 5_000_000; // ~5 Mbps: 1080p nítido, ~75 s cabem em 46 MB

export function isRecorderSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

// iPhone (Safari) grava MP4; Chrome/Android geralmente WebM.
function pickMime(): { mime: string; ext: string } {
  const options: { mime: string; ext: string }[] = [
    { mime: "video/mp4;codecs=avc1", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  for (const o of options) {
    if (MediaRecorder.isTypeSupported(o.mime)) return o;
  }
  return { mime: "", ext: "mp4" };
}

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoRecorder({
  onDone,
  onClose,
}: {
  onDone: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bytesRef = useRef(0);
  const startedAtRef = useRef(0);
  const [status, setStatus] = useState<"starting" | "ready" | "recording" | "saving" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [usedPct, setUsedPct] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Liga a câmera traseira em 1080p ao abrir; desliga ao fechar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setStatus("error");
        setError(
          "Could not open the camera. Allow camera and microphone access for this site in your phone's settings, then try again."
        );
      }
    })();
    return () => {
      cancelled = true;
      // Fechou no meio da gravação: descarta (não dispara onDone depois de fechar).
      const rec = recorderRef.current;
      if (rec && rec.state === "recording") {
        rec.ondataavailable = null;
        rec.onstop = null;
        rec.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Timer enquanto grava.
  useEffect(() => {
    if (status !== "recording") return;
    const id = window.setInterval(() => {
      setElapsed((Date.now() - startedAtRef.current) / 1000);
    }, 250);
    return () => window.clearInterval(id);
  }, [status]);

  function start() {
    const stream = streamRef.current;
    if (!stream) return;
    const { mime, ext } = pickMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: VIDEO_BPS } : { videoBitsPerSecond: VIDEO_BPS });
    } catch {
      rec = new MediaRecorder(stream);
    }
    chunksRef.current = [];
    bytesRef.current = 0;
    rec.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      chunksRef.current.push(e.data);
      bytesRef.current += e.data.size;
      setUsedPct(Math.min(100, Math.round((bytesRef.current / MAX_BYTES) * 100)));
      // Para sozinho antes de estourar o limite do arquivo.
      if (bytesRef.current >= MAX_BYTES && rec.state === "recording") rec.stop();
    };
    rec.onstop = () => {
      setStatus("saving");
      const type = rec.mimeType || mime || "video/mp4";
      const blob = new Blob(chunksRef.current, { type });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = new File([blob], `inspection-video-${stamp}.${type.includes("webm") ? "webm" : ext}`, { type });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onDone(file);
    };
    recorderRef.current = rec;
    startedAtRef.current = Date.now();
    setElapsed(0);
    setUsedPct(0);
    rec.start(1000); // fatia de 1 s: dá pra medir o tamanho enquanto grava
    setStatus("recording");
  }

  function stop() {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") rec.stop();
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-semibold">Record video</span>
        {status !== "recording" && status !== "saving" && (
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        {status === "starting" && (
          <div className="absolute inset-0 grid place-items-center text-white/80">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white">{error}</div>
        )}
        {status === "recording" && (
          <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500 align-middle" />
            {mmss(elapsed)}
            <span className="ml-2 text-xs font-normal text-white/70">{usedPct}% of max length</span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2 px-4 pb-8 pt-4 text-white">
        {status === "ready" && (
          <button type="button" onClick={start} aria-label="Start recording" className="grid h-16 w-16 place-items-center rounded-full border-4 border-white">
            <Circle className="h-12 w-12 fill-red-500 text-red-500" />
          </button>
        )}
        {status === "recording" && (
          <button type="button" onClick={stop} aria-label="Stop recording" className="grid h-16 w-16 place-items-center rounded-full border-4 border-white">
            <Square className="h-7 w-7 fill-red-500 text-red-500" />
          </button>
        )}
        {status === "saving" && (
          <span className="inline-flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Saving video…
          </span>
        )}
        <span className="text-xs text-white/60">Full HD · stops on its own at the size limit (about 1 minute)</span>
      </div>
    </div>,
    document.body
  );
}
