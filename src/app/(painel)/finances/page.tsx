import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, NoAccess, Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { money } from "@/lib/format";
import { Home, CalendarDays, Hammer, KeyRound, Receipt, TrendingUp } from "lucide-react";
import { SalesCommissionsSection, type ClosedDeal } from "./SalesCommissionsSection";
import { setSaleCommissionAction } from "./actions";

export const dynamic = "force-dynamic";

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const yearOf = (s: string | null): number | null => {
  if (!s) return null;
  const y = Number(String(s).slice(0, 4));
  return Number.isFinite(y) ? y : null;
};

type Stream = { received: number; pending: number };

export default async function FinancesPage({
  searchParams,
}: {
  searchParams?: { year?: string };
}) {
  const profile = await getProfile();
  // Finances = owner + manager only (financials.full). A secretária NÃO acessa.
  if (!can(profile, "financials.full")) {
    return (
      <>
        <PageHeader title="Finances" />
        <NoAccess />
      </>
    );
  }

  const supabase = createClient();
  const [{ data: pays }, { data: invs }, { data: deals }, { data: exps }] = await Promise.all([
    supabase
      .from("payments")
      .select("commission, status, received_at, month, due_date")
      .is("archived_at", null),
    supabase
      .from("invoices")
      .select("kind, bythec_commission, labor_total, material_total, paid, paid_date, date"),
    supabase
      .from("clients")
      .select("id, name, sale_commission, sale_commission_received, deal_closed_at")
      .eq("client_type", "buy_sell_client")
      .eq("deal_status", "closed")
      .order("deal_closed_at", { ascending: false }),
    supabase.from("expenses").select("price, date, paid").is("archived_at", null),
  ]);

  const payments = pays ?? [];
  const invoices = invs ?? [];
  const closedDeals = (deals ?? []) as ClosedDeal[];
  const expenses = exps ?? [];

  // Anos disponíveis a partir dos dados (+ ano corrente).
  const yearsSet = new Set<number>([new Date().getFullYear()]);
  for (const p of payments) {
    const y = yearOf((p.received_at as string) ?? (p.month as string) ?? (p.due_date as string));
    if (y) yearsSet.add(y);
  }
  for (const iv of invoices) {
    const y = yearOf((iv.paid_date as string) ?? (iv.date as string));
    if (y) yearsSet.add(y);
  }
  for (const d of closedDeals) {
    const y = yearOf(d.deal_closed_at);
    if (y) yearsSet.add(y);
  }
  for (const e of expenses) {
    const y = yearOf(e.date as string);
    if (y) yearsSet.add(y);
  }
  const years = Array.from(yearsSet).sort((a, b) => b - a);

  const sel = searchParams?.year ?? String(new Date().getFullYear());
  const isAll = sel === "all";
  const selYear = isAll ? null : Number(sel);
  const match = (s: string | null) => isAll || yearOf(s) === selYear;

  // ---- Aggregate each stream (received vs pending) ----
  const yearRound: Stream = { received: 0, pending: 0 };
  for (const p of payments) {
    const amt = n(p.commission);
    if (!amt) continue;
    if (p.status === "received") {
      if (match((p.received_at as string) ?? (p.month as string) ?? (p.due_date as string)))
        yearRound.received += amt;
    } else if (match((p.month as string) ?? (p.due_date as string))) {
      yearRound.pending += amt;
    }
  }

  const seasonal: Stream = { received: 0, pending: 0 };
  const service: Stream = { received: 0, pending: 0 };
  for (const iv of invoices) {
    const paidWhen = (iv.paid_date as string) ?? (iv.date as string);
    if (iv.kind === "seasonal") {
      const amt = n(iv.bythec_commission);
      if (!amt) continue;
      if (iv.paid) {
        if (match(paidWhen)) seasonal.received += amt;
      } else if (match(iv.date as string)) seasonal.pending += amt;
    } else if (iv.kind === "service") {
      const amt = n(iv.labor_total) + n(iv.material_total);
      if (!amt) continue;
      if (iv.paid) {
        if (match(paidWhen)) service.received += amt;
      } else if (match(iv.date as string)) service.pending += amt;
    }
  }

  const sales: Stream = { received: 0, pending: 0 };
  for (const d of closedDeals) {
    const amt = n(d.sale_commission);
    if (!amt || !match(d.deal_closed_at)) continue;
    if (d.sale_commission_received) sales.received += amt;
    else sales.pending += amt;
  }

  const expensesTotal = expenses.reduce((s, e) => (match(e.date as string) ? s + n(e.price) : s), 0);

  const totalReceived = yearRound.received + seasonal.received + service.received + sales.received;
  const totalPending = yearRound.pending + seasonal.pending + service.pending + sales.pending;
  const net = totalReceived - expensesTotal;

  const dealsForYear = isAll ? closedDeals : closedDeals.filter((d) => yearOf(d.deal_closed_at) === selYear);

  const streams = [
    { key: "yr", label: "Year-round rent commission", icon: Home, s: yearRound },
    { key: "seasonal", label: "Seasonal commission (Airbnb/VRBO)", icon: CalendarDays, s: seasonal },
    { key: "service", label: "Service income", icon: Hammer, s: service },
    { key: "sales", label: "Sales commission", icon: KeyRound, s: sales },
  ];

  return (
    <>
      <PageHeader
        title="Finances"
        subtitle="By the C earnings across every stream — received vs. still owed, net of expenses."
      />

      {/* Year switcher */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        <YearPill href="/finances?year=all" active={isAll} label="All time" />
        {years.map((y) => (
          <YearPill key={y} href={`/finances?year=${y}`} active={!isAll && selYear === y} label={String(y)} />
        ))}
      </div>

      {/* Grand total + net */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-5 shadow-card">
          <p className="text-xs uppercase tracking-wider text-ink/50">Received {isAll ? "(all time)" : `in ${sel}`}</p>
          <p className="mt-1 text-2xl font-bold text-primary">{money(totalReceived)}</p>
          <p className="mt-1 text-xs text-ink/45">{money(totalPending)} still owed</p>
        </div>
        <div className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-card">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-ink/50">
            <Receipt className="h-3.5 w-3.5" /> Expenses
          </p>
          <p className="mt-1 text-2xl font-bold text-secondary">{money(expensesTotal)}</p>
          <Link href="/expenses" className="mt-1 inline-block text-xs text-primary hover:underline">
            View expenses →
          </Link>
        </div>
        <div className="rounded-2xl border border-black/[0.08] bg-ink/[0.02] p-5 shadow-card">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-ink/50">
            <TrendingUp className="h-3.5 w-3.5" /> Net after expenses
          </p>
          <p className={"mt-1 text-2xl font-bold " + (net >= 0 ? "text-ink" : "text-red-600")}>{money(net)}</p>
          <p className="mt-1 text-xs text-ink/45">received earnings − expenses</p>
        </div>
      </div>

      {/* Streams */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {streams.map(({ key, label, icon: Icon, s }) => (
          <div key={key} className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-semibold text-ink/80">{label}</h3>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-ink/45">Received</p>
                <p className="text-xl font-bold text-primary">{money(s.received)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-ink/45">Owed</p>
                <p className="text-lg font-semibold text-ink/70">{money(s.pending)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sales commission entry */}
      <div className="mt-8">
        <h2 className="h-display mb-1 text-base text-ink">Sales commissions {isAll ? "" : `· ${sel}`}</h2>
        <p className="mb-3 text-sm text-ink/55">
          Record what By the C earned on each closed sale, and mark it when received.
        </p>
        <SalesCommissionsSection deals={dealsForYear} action={setSaleCommissionAction} />
      </div>
    </>
  );
}

function YearPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        "rounded-lg px-3 py-1.5 text-sm transition " +
        (active
          ? "bg-primary/10 font-semibold text-primary"
          : "border border-black/[0.08] bg-white text-ink/60 hover:text-ink")
      }
    >
      {label}
    </Link>
  );
}
