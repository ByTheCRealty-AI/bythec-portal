"use client";

// =============================================================================
// CommissionCollectedControl — controle da comissão da By the C DENTRO da janela
// do pagamento (padrão "TUDO na janela"). Mostra se a comissão foi coletada e,
// quando coletada, deixa EDITAR a data em que entrou. A data é auto-preenchida
// quando a Andrea marca o owner como pago (rent_collection='bythec' — ela retém
// os 10% ao repassar), mas segue editável aqui. Fora da janela, a linha mostra
// só um selo de status (CommissionStatusBadge), sem toggle.
// =============================================================================

import { useState, useTransition } from "react";
import { CheckSquare, Square, Loader2, Percent } from "lucide-react";
import { money } from "@/lib/format";
import type { Payment } from "@/lib/types";

export type CommissionActions = {
  setCommissionPaid: (id: string, paid: boolean) => Promise<void>;
  setCommissionPaidDate: (id: string, dateStr: string | null) => Promise<void>;
};

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

export function CommissionCollectedControl({
  payment,
  canManage,
  actions,
}: {
  payment: Payment;
  canManage: boolean;
  actions: CommissionActions;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const paid = payment.commission_paid;
  // Owner-collects (arrangement B): a comissão VEM do owner → "received".
  const ownerRemits = payment.property?.rent_collection === "owner";
  const verb = ownerRemits ? "received" : "collected";
  const [localDate, setLocalDate] = useState<string>(isoToDateNY(payment.commission_paid_at));

  function toggle() {
    setError(null);
    start(async () => {
      try {
        await actions.setCommissionPaid(payment.id, !paid);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save. Try again.");
      }
    });
  }

  function saveDate(value: string) {
    setLocalDate(value);
    setError(null);
    start(async () => {
      try {
        await actions.setCommissionPaidDate(payment.id, value || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the date.");
      }
    });
  }

  const inputClass =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15 disabled:opacity-60";

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">
            <Percent className="mr-1 inline h-4 w-4 text-ink/50" /> My commission
          </p>
          <p className="text-xs text-ink/55">{money(payment.commission)}</p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className={
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 " +
              (paid
                ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/[0.15]"
                : "border-black/[0.12] bg-white text-ink/55 hover:border-primary/40 hover:text-primary")
            }
            title={paid ? `Commission ${verb} — click to undo` : `Mark commission as ${verb}`}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : paid ? (
              <CheckSquare className="h-3.5 w-3.5" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
            {paid ? (ownerRemits ? "Received" : "Collected") : `Not ${verb}`}
          </button>
        ) : paid ? (
          <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {ownerRemits ? "Received" : "Collected"}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-secondary/25 bg-secondary/10 px-2.5 py-0.5 text-xs font-semibold text-secondary">
            Not {verb}
          </span>
        )}
      </div>

      {paid && (
        <div className="mt-3 border-t border-black/[0.06] pt-3">
          <label className="mb-1 block text-xs text-ink/55">Date {verb}</label>
          <input
            type="date"
            value={localDate}
            onChange={(e) => saveDate(e.target.value)}
            disabled={!canManage || pending}
            className={inputClass}
          />
          <p className="mt-2 text-xs italic text-ink/45">
            Auto-filled when you marked the owner paid. Change it if you {verb} on another day.
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
