"use client";

// =============================================================================
// ReceivedDateEditor — editor da DATA RECEBIDA de um aluguel (first/last/monthly)
// já received, dentro da janela do pagamento. Espelha o editor de data da
// comissão e do depósito: input date que salva na hora (setPaymentReceivedDate).
// Depósito tem o seu próprio editor (DepositReceivedControl); aqui é só aluguel.
// =============================================================================

import { useState, useTransition } from "react";
import { Loader2, CalendarCheck } from "lucide-react";
import { setPaymentReceivedDateAction } from "./actions";
import type { Payment } from "@/lib/types";

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

export function ReceivedDateEditor({ payment, canManage }: { payment: Payment; canManage: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localDate, setLocalDate] = useState<string>(isoToDateNY(payment.received_at));

  function save(value: string) {
    setLocalDate(value);
    if (!value) return;
    setError(null);
    start(async () => {
      try {
        await setPaymentReceivedDateAction(payment.id, value);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the date.");
      }
    });
  }

  const inputClass =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15 disabled:opacity-60";

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm">
      <label className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <CalendarCheck className="h-4 w-4 text-ink/50" /> Date received
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink/40" />}
      </label>
      <input
        type="date"
        value={localDate}
        onChange={(e) => save(e.target.value)}
        disabled={!canManage || pending}
        className={inputClass}
      />
      <p className="mt-1.5 text-xs text-ink/45">The day this payment actually came in.</p>
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
