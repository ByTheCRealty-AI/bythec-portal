"use client";

// Seção de comissões de venda (brokerage) na tela Finances. Lista os deals
// FECHADOS (buy/sell clients, deal_status='closed') e deixa owner/manager digitar
// a comissão ganha por deal + marcar como recebida. Grava via setSaleCommissionAction.
import { useState, useTransition } from "react";
import { money, date } from "@/lib/format";
import { inputClass } from "@/components/ui";
import { Check, Loader2 } from "lucide-react";

export type ClosedDeal = {
  id: string;
  name: string;
  sale_commission: number | null;
  sale_commission_received: boolean;
  deal_closed_at: string | null;
};

export function SalesCommissionsSection({
  deals,
  action,
}: {
  deals: ClosedDeal[];
  action: (clientId: string, amount: number | null, received: boolean) => Promise<void>;
}) {
  if (deals.length === 0) {
    return (
      <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-6 text-center text-sm text-ink/50 shadow-card">
        No closed sales yet. Deals you close in the Sales tab show up here to record their commission.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
          <tr>
            <th className="px-4 py-3 font-bold">Deal</th>
            <th className="px-4 py-3 font-bold">Closed</th>
            <th className="px-4 py-3 font-bold">Commission</th>
            <th className="px-4 py-3 font-bold">Received</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d, i) => (
            <DealRow key={d.id} deal={d} action={action} zebra={i % 2 === 1} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DealRow({
  deal,
  action,
  zebra,
}: {
  deal: ClosedDeal;
  action: (clientId: string, amount: number | null, received: boolean) => Promise<void>;
  zebra: boolean;
}) {
  const [amount, setAmount] = useState(deal.sale_commission?.toString() ?? "");
  const [received, setReceived] = useState(deal.sale_commission_received);
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);

  function save(nextReceived = received) {
    const raw = amount.trim();
    const num = raw === "" ? null : Number(raw);
    if (raw !== "" && !Number.isFinite(num)) {
      setErr(true);
      return;
    }
    setErr(false);
    start(() =>
      action(deal.id, num, nextReceived).catch(() => setErr(true))
    );
  }

  return (
    <tr className={zebra ? "bg-black/[0.012]" : ""}>
      <td className="px-4 py-3 font-medium text-ink">{deal.name}</td>
      <td className="whitespace-nowrap px-4 py-3 text-ink/60">{date(deal.deal_closed_at)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-ink/40">$</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => {
              if ((deal.sale_commission?.toString() ?? "") !== amount.trim()) save();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            inputMode="decimal"
            placeholder="0.00"
            className={inputClass + " !w-28 !py-1.5"}
          />
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink/40" />}
          {err && <span className="text-xs text-red-600">check value</span>}
        </div>
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => {
            const next = !received;
            setReceived(next);
            save(next);
          }}
          disabled={pending}
          className={
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition " +
            (received
              ? "bg-primary/10 text-primary hover:bg-primary/20"
              : "bg-black/[0.05] text-ink/55 hover:bg-black/[0.08]")
          }
        >
          {received ? <Check className="h-3 w-3" /> : null}
          {received ? "Received" : "Mark received"}
        </button>
      </td>
    </tr>
  );
}
