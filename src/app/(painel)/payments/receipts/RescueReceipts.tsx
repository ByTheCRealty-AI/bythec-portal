"use client";

// Roda o resgate em loop: chama um lote, mostra o progresso, chama o próximo,
// até acabar. Loop no CLIENTE de propósito — cada chamada é uma execução curta
// e independente na Vercel, então não existe risco de estourar o limite de
// tempo no meio de 515 arquivos.
import { useState } from "react";
import { Loader2, ShieldCheck, Play, AlertTriangle, RotateCcw } from "lucide-react";
import { buttonClass } from "@/components/ui";
import type { RescueProgress } from "./actions";

type Counts = { remaining: number; failed: number; local: number };

export function RescueReceipts({
  initial,
  runBatch,
  retryFailed,
}: {
  initial: Counts;
  runBatch: () => Promise<RescueProgress>;
  retryFailed: () => Promise<{ cleared: number }>;
}) {
  const [counts, setCounts] = useState<Counts>(initial);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(0);
  const [errors, setErrors] = useState<{ fileName: string; reason: string }[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const total = initial.remaining;
  const pct = total > 0 ? Math.min(100, Math.round((copied / total) * 100)) : 0;

  async function start() {
    setRunning(true);
    setFatal(null);
    setDone(false);
    let guard = 0; // trava contra loop infinito se algo parar de progredir
    try {
      for (;;) {
        const r = await runBatch();
        setCopied((c) => c + r.copied);
        setCounts((c) => ({ ...c, remaining: r.remaining, failed: c.failed + r.failed }));
        if (r.errors.length) setErrors((e) => [...e, ...r.errors].slice(0, 50));
        if (r.remaining === 0) break;
        if (r.copied === 0 && r.failed === 0) break; // nada avançou — para
        if (++guard > 400) break;
      }
      setDone(true);
    } catch (err) {
      setFatal(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  }

  async function retry() {
    setRunning(true);
    setFatal(null);
    try {
      const { cleared } = await retryFailed();
      setCounts((c) => ({ ...c, remaining: c.remaining + cleared, failed: 0 }));
      setErrors([]);
    } catch (err) {
      setFatal(err instanceof Error ? err.message : "Could not reset the failed files.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Still on Bubble" value={counts.remaining} tone={counts.remaining > 0 ? "warn" : "ok"} />
        <Stat label="Safely in your storage" value={counts.local + copied} tone="ok" />
        <Stat label="Could not be copied" value={counts.failed} tone={counts.failed > 0 ? "bad" : "ok"} />
      </div>

      {running && (
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-ink/60">
            <span>Copying… {copied} of {total}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/[0.07]">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-ink/50">
            Keep this page open until it finishes. If you close it, nothing breaks — the files
            already copied stay copied, and you can pick up where you left off.
          </p>
        </div>
      )}

      {done && counts.remaining === 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] px-3.5 py-3 text-sm text-primary">
          <ShieldCheck className="h-4 w-4" />
          Done. Every receipt that could be copied is now in your own storage. Bubble can be shut
          down without losing them.
        </p>
      )}

      {fatal && (
        <p className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {fatal}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={start} disabled={running || counts.remaining === 0} className={buttonClass("primary")}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? "Copying…" : counts.remaining === 0 ? "Nothing left to copy" : `Copy ${counts.remaining} receipts`}
        </button>
        {counts.failed > 0 && !running && (
          <button type="button" onClick={retry} className={buttonClass("ghost")}>
            <RotateCcw className="h-4 w-4" /> Try the {counts.failed} failed again
          </button>
        )}
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-black/[0.08] bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/50">
            Files that could not be copied
          </p>
          <p className="mb-3 text-xs text-ink/55">
            These are usually files Bubble no longer has. The payment record and its amount are
            untouched — only the image is missing.
          </p>
          <ul className="space-y-1.5 text-sm">
            {errors.map((e, i) => (
              <li key={i} className="flex justify-between gap-4 border-t border-black/[0.06] pt-1.5">
                <span className="truncate text-ink/80">{e.fileName}</span>
                <span className="shrink-0 text-xs text-red-600">{e.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "bad" }) {
  const ring =
    tone === "bad" ? "border-red-200 bg-red-50" : tone === "warn" ? "border-amber-200 bg-amber-50" : "border-black/[0.08] bg-white";
  const text = tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-700" : "text-ink";
  return (
    <div className={`rounded-2xl border px-4 py-3.5 shadow-card ${ring}`}>
      <p className="text-xs uppercase tracking-wider text-ink/50">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold ${text}`}>{value}</p>
    </div>
  );
}
