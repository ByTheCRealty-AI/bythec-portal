"use client";

// =============================================================================
// LeaseRenewalsCard — card COMPACTO do Overview: leases (year-round/off-season)
// terminando nos próximos 90 dias, mais próximos no topo. Cada linha linka pra
// propriedade + tem um "descartar" (×) pra sumir do Overview (inquilino saindo,
// imóvel não é mais nosso). Descartados ficam num toggle com "Restore".
// =============================================================================

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { CalendarClock, X, RotateCcw } from "lucide-react";
import { cx } from "@/lib/format";
import { dismissRenewalAction, restoreRenewalAction } from "./lease-renewals-actions";

export type RenewalItem = {
  id: string;
  label: string;
  unit: string | null;
  tenant: string | null;
  days: number;
  endLabel: string;
};

const VISIBLE = 4;

export function LeaseRenewalsCard({
  active,
  dismissed,
  canManage,
}: {
  active: RenewalItem[];
  dismissed: RenewalItem[];
  canManage: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [pending, start] = useTransition();

  const shown = expanded ? active : active.slice(0, VISIBLE);

  function dismiss(id: string) {
    start(() => dismissRenewalAction(id).catch(() => {}));
  }
  function restore(id: string) {
    start(() => restoreRenewalAction(id).catch(() => {}));
  }

  return (
    <Card className="mt-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h2 className="h-display text-lg text-ink">Lease renewals</h2>
            <p className="text-xs text-ink/50">Leases ending in the next 90 days</p>
          </div>
        </div>
        {active.length > 0 && (
          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            {active.length} upcoming
          </span>
        )}
      </div>

      {active.length === 0 ? (
        <p className="mt-4 text-sm text-ink/50">No leases renewing in the next 90 days.</p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {shown.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-lg border border-black/[0.06] bg-white px-3.5 py-2"
            >
              <Link href={`/propriedades/${r.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink hover:text-primary">
                  {r.label}
                  {r.unit && <span className="font-normal text-ink/45"> · {r.unit}</span>}
                </span>
                {r.tenant && <span className="block truncate text-xs text-ink/50">{r.tenant}</span>}
              </Link>
              <span className="shrink-0 text-right">
                <span
                  className={cx(
                    "inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    r.days <= 30
                      ? "border border-amber-300 bg-amber-50 text-amber-700"
                      : "border border-black/10 bg-black/[0.03] text-ink/60"
                  )}
                >
                  in {r.days}d
                </span>
                <span className="mt-0.5 block text-[11px] text-ink/40">ends {r.endLabel}</span>
              </span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => dismiss(r.id)}
                  disabled={pending}
                  title="Dismiss — remove from Overview"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-black/[0.08] text-ink/35 transition hover:border-red-300 hover:text-red-500 disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {active.length > VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-sm font-semibold text-primary hover:underline"
        >
          {expanded ? "Show less" : `Show all ${active.length}`}
        </button>
      )}

      {dismissed.length > 0 && (
        <div className="mt-4 border-t border-black/[0.06] pt-3">
          <button
            type="button"
            onClick={() => setShowDismissed((v) => !v)}
            className="text-xs font-semibold text-ink/45 hover:text-ink/70"
          >
            {showDismissed ? "Hide" : "Show"} {dismissed.length} dismissed
          </button>
          {showDismissed && (
            <ul className="mt-2 space-y-1.5">
              {dismissed.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-lg bg-black/[0.015] px-3.5 py-2">
                  <Link href={`/propriedades/${r.id}`} className="min-w-0 flex-1 truncate text-sm text-ink/55 line-through hover:text-primary">
                    {r.label}
                    {r.tenant && <span className="text-ink/35"> · {r.tenant}</span>}
                  </Link>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => restore(r.id)}
                      disabled={pending}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-black/[0.08] px-2 py-1 text-[11px] font-semibold text-ink/55 transition hover:border-primary/40 hover:text-primary disabled:opacity-60"
                    >
                      <RotateCcw className="h-3 w-3" /> Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
