// =============================================================================
// OwnerOwesCard — "Owner owes" no Overview.
// =============================================================================
// Andrea (2026-09-25): quer ver o que os owners devem em invoices de serviço
// "in the overview if it's been more than 7 days that it's been sent".
//
// Regra de idade (decisão dela): conta 7 dias a partir do `sent_at`; quando a
// invoice nunca foi marcada como enviada, conta a partir da DATA da invoice —
// senão as que ela desconta do aluguel (e costuma não marcar como enviadas)
// nunca apareceriam, que era justamente o caso das do Giancarlo e do Jon.
//
// "Deduct from rent" só aparece quando a By the C recolhe o aluguel daquela
// casa (rent_collection='bythec'); se o owner recebe direto, não há repasse de
// onde descontar e a linha diz isso.
import Link from "next/link";
import { Card } from "@/components/ui";
import { Wallet } from "lucide-react";
import { money } from "@/lib/format";

export type OwnerOweItem = {
  id: string;
  invoiceNumber: number | null;
  owner: string;
  property: string;
  unit: string | null;
  owed: number;
  days: number;
  sent: boolean;
  canDeduct: boolean;
  partiallyPaid: boolean;
};

export function OwnerOwesCard({ items }: { items: OwnerOweItem[] }) {
  const total = items.reduce((a, i) => a + i.owed, 0);

  return (
    <Card className="mt-6 border-amber-400/40 bg-amber-50/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="h-display text-lg text-ink">
          <Wallet className="mr-1.5 inline h-4 w-4 text-amber-700" /> Owner owes
        </h2>
        <span className="h-display text-xl text-amber-700">{money(total)}</span>
      </div>
      <p className="mt-1 text-xs text-ink/50">
        Unpaid invoices, more than 7 days old. {items.length} {items.length === 1 ? "invoice" : "invoices"}.
      </p>

      <ul className="mt-3 divide-y divide-black/[0.06]">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5">
            <span className="text-sm text-ink/85">
              <Link href={`/invoices/${i.id}`} className="font-semibold text-ink hover:text-primary">
                {i.owner}
              </Link>
              <span className="block text-xs text-ink/50">
                #{i.invoiceNumber ?? "—"} · {i.property}
                {i.unit ? ` · ${i.unit}` : ""} ·{" "}
                {i.sent ? `sent ${i.days} days ago` : `invoiced ${i.days} days ago, not marked sent`}
                {i.partiallyPaid ? " · partly paid" : ""}
              </span>
              <span className="mt-0.5 block text-xs text-ink/45">
                {i.canDeduct ? "Can come off the rent payout" : "Owner collects the rent — they pay you directly"}
              </span>
            </span>
            <span className="h-display text-base text-amber-700">{money(i.owed)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
