"use client";

// =============================================================================
// ServiceTrackingPanel — controle INTERNO de um invoice de SERVICE.
// Cinco estados, cada um com data editável:
//   Sent to owner · Owner paid · Labor paid to worker · Material paid · Commission collected
// "Owner paid" REUSA o flag `paid` do invoice (setPaid) — e marcar pago AUTO-marca
// a comissão (ela entra junto com o pagamento do owner). Mostra o breakdown interno
// (custo do worker, sua comissão de 10%, total ao owner) + quem fez o serviço.
// Nada aqui vai pro PDF do owner. Escondido na impressão.
// =============================================================================

import { useState, useTransition } from "react";
import { ClipboardCheck, Check } from "lucide-react";
import { money } from "@/lib/format";
import {
  setPaid,
  setSentToOwner,
  setLaborPaid,
  setMaterialPaid,
  setCommissionCollected,
  setSentDate,
  setInvoicePaidDate,
  setLaborPaidDate,
  setMaterialPaidDate,
  setCommissionCollectedDate,
  setServiceProvider,
} from "./actions";

type ProviderOption = { id: string; name: string };

function StateRow({
  label,
  hint,
  checked,
  date,
  canManage,
  onToggle,
  onSetDate,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  date: string | null;
  canManage: boolean;
  onToggle: (v: boolean) => Promise<void>;
  onSetDate: (ymd: string | null) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [localDate, setLocalDate] = useState<string>(date ? date.slice(0, 10) : "");
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    start(async () => {
      try {
        await onToggle(!checked);
        if (!checked) setLocalDate(new Date().toISOString().slice(0, 10));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Try again.");
      }
    });
  }

  function saveDate(value: string) {
    setLocalDate(value);
    setError(null);
    start(async () => {
      try {
        await onSetDate(value || null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the date.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-black/[0.07] bg-white px-4 py-3">
      <label className="inline-flex cursor-pointer select-none items-center gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          disabled={!canManage || pending}
          onChange={toggle}
          className="h-4 w-4 rounded border-black/25 text-primary focus:ring-primary/30"
        />
        <span>
          <span className={checked ? "text-sm font-semibold text-primary" : "text-sm font-medium text-ink/70"}>
            {label}
          </span>
          {hint && <span className="ml-1.5 text-xs text-ink/40">{hint}</span>}
        </span>
      </label>

      {checked ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink/50">on</span>
          <input
            type="date"
            value={localDate}
            onChange={(e) => saveDate(e.target.value)}
            disabled={!canManage || pending}
            className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
          />
        </div>
      ) : (
        <span className="text-xs italic text-ink/40">Not yet</span>
      )}

      {error && <p className="w-full text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

export function ServiceTrackingPanel({
  invoiceId,
  canManage,
  providerId,
  providers,
  laborCost,
  materialCost,
  commission,
  ownerTotal,
  sent,
  sentAt,
  ownerPaid,
  ownerPaidDate,
  laborPaid,
  laborPaidAt,
  materialPaid,
  materialPaidAt,
  commissionCollected,
  commissionCollectedAt,
}: {
  invoiceId: string;
  canManage: boolean;
  providerId: string | null;
  providers: ProviderOption[];
  laborCost: number | null;
  materialCost: number | null;
  commission: number | null;
  ownerTotal: number;
  sent: boolean;
  sentAt: string | null;
  ownerPaid: boolean;
  ownerPaidDate: string | null;
  laborPaid: boolean;
  laborPaidAt: string | null;
  materialPaid: boolean;
  materialPaidAt: string | null;
  commissionCollected: boolean;
  commissionCollectedAt: string | null;
}) {
  const [pendingProvider, startProvider] = useTransition();
  const [localProvider, setLocalProvider] = useState<string>(providerId ?? "");

  function changeProvider(v: string) {
    setLocalProvider(v);
    startProvider(async () => {
      try {
        await setServiceProvider(invoiceId, v || null);
      } catch {
        /* silencioso — a data ainda persiste no próximo save */
      }
    });
  }

  const allSettled = sent && ownerPaid && laborPaid && materialPaid && commissionCollected;
  const workerCost = (laborCost ?? 0) + (materialCost ?? 0);

  const inputClass =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15 disabled:opacity-60";

  return (
    <div className="print-hide rounded-2xl border border-black/[0.08] bg-white p-5 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="h-display text-base text-ink">
          <ClipboardCheck className="mr-1.5 inline h-4 w-4 text-ink/50" /> Tracking
        </h3>
        <div className="flex items-center gap-2">
          {allSettled && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              <Check className="h-3 w-3" /> Settled
            </span>
          )}
          <span className="text-xs text-ink/45">Internal · not on the invoice PDF</span>
        </div>
      </div>

      {/* Breakdown interno: custo do worker, sua comissão, total ao owner. */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Worker cost" value={money(workerCost)} />
        <Stat label="Your commission" value={money(commission)} accent="secondary" />
        <Stat label="Owner pays" value={money(ownerTotal)} accent="primary" />
        <div>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ink/40">Worker</span>
          <select
            value={localProvider}
            onChange={(e) => changeProvider(e.target.value)}
            disabled={!canManage || pendingProvider}
            className={inputClass}
          >
            <option value="">In-house / none</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <StateRow
          label="Sent to owner"
          checked={sent}
          date={sentAt}
          canManage={canManage}
          onToggle={(v) => setSentToOwner(invoiceId, v)}
          onSetDate={(d) => setSentDate(invoiceId, d)}
        />
        <StateRow
          label="Owner paid"
          hint="ticks commission automatically"
          checked={ownerPaid}
          date={ownerPaidDate}
          canManage={canManage}
          onToggle={(v) => setPaid(invoiceId, v)}
          onSetDate={(d) => setInvoicePaidDate(invoiceId, d)}
        />
        <StateRow
          label="Labor paid to worker"
          checked={laborPaid}
          date={laborPaidAt}
          canManage={canManage}
          onToggle={(v) => setLaborPaid(invoiceId, v)}
          onSetDate={(d) => setLaborPaidDate(invoiceId, d)}
        />
        <StateRow
          label="Material paid to worker"
          checked={materialPaid}
          date={materialPaidAt}
          canManage={canManage}
          onToggle={(v) => setMaterialPaid(invoiceId, v)}
          onSetDate={(d) => setMaterialPaidDate(invoiceId, d)}
        />
        <StateRow
          label="Commission collected"
          checked={commissionCollected}
          date={commissionCollectedAt}
          canManage={canManage}
          onToggle={(v) => setCommissionCollected(invoiceId, v)}
          onSetDate={(d) => setCommissionCollectedDate(invoiceId, d)}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "primary" | "secondary";
}) {
  const color = accent === "primary" ? "text-primary" : accent === "secondary" ? "text-secondary" : "text-ink";
  return (
    <div className="rounded-xl border border-black/[0.06] bg-black/[0.015] px-3 py-2">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink/40">{label}</span>
      <span className={`h-display text-base ${color}`}>{value}</span>
    </div>
  );
}
