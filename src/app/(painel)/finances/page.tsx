import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, NoAccess, Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { money } from "@/lib/format";
import { Home, CalendarDays, Hammer, KeyRound, Receipt, TrendingUp, FileText } from "lucide-react";
import { SalesCommissionsSection, type SoldListing } from "./SalesCommissionsSection";

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
  const [{ data: pays }, { data: invs }, { data: sold }, { data: exps }] = await Promise.all([
    supabase
      .from("payments")
      .select("commission, status, received_at, month, due_date")
      .is("archived_at", null),
    supabase
      .from("invoices")
      .select(
        "kind, bythec_commission, labor_total, material_total, service_commission, commission_collected, commission_collected_at, general_total, paid, paid_date, date"
      ),
    // Comissão de venda: LIDA da propriedade (sale_commission, 0027), não digitada
    // de novo. Casa vendida = comissão ganha (sai na mesa do fechamento, não tem
    // etapa de cobrança). Vendida = sale_status='sold' OU sold_at preenchido — a
    // Andrea pode registrar a data antes de mexer no status.
    supabase
      .from("properties")
      .select(
        "id, address, address2, sale_price, sale_commission, sale_commission_rate, sale_status, sold_at, owner:owner_id (id, name)"
      )
      .eq("is_for_sale", true)
      .is("archived_at", null)
      .or("sale_status.eq.sold,sold_at.not.is.null")
      .order("sold_at", { ascending: false }),
    supabase.from("expenses").select("price, date, paid").is("archived_at", null),
  ]);

  const payments = pays ?? [];
  const invoices = invs ?? [];
  const soldListings = (sold ?? []) as unknown as SoldListing[];
  const expenses = exps ?? [];

  // Non-facilitator fee (taxa única, sem etapa de cobrança). Duas fontes, SEM
  // sobreposição pra não duplicar:
  //  • ALUGUEL → fee no IMÓVEL (year-round/winter). one_month_rent usa o rent.
  //  • VENDA/COMPRA → fee no CLIENTE buy/sell (o comprador não tem imóvel).
  // Por isso o imóvel aqui é SÓ rental (exclui for-sale — a venda vem do cliente).
  const { data: nfData } = await supabase
    .from("properties")
    .select("nf_fee_type, nf_fee_value, rent_price, sold_at, rental_start, updated_at")
    .eq("non_facilitator", true)
    .or("is_year_round.eq.true,is_winter.eq.true")
    .is("archived_at", null);
  const nfProps = (nfData ?? []) as Array<Record<string, unknown>>;
  const nfAmount = (p: Record<string, unknown>): number => {
    const t = p.nf_fee_type as string | null;
    const v = n(p.nf_fee_value as number | null);
    if (t === "flat") return v;
    if (t === "one_month_rent") return n(p.rent_price as number | null);
    return 0; // percent num aluguel não tem base — não soma
  };
  const nfWhen = (p: Record<string, unknown>): string | null =>
    ((p.rental_start as string) ?? (p.sold_at as string) ?? (p.updated_at as string) ?? null);

  // Fee no CLIENTE buy/sell (comprador sem imóvel). Flat conta exato; percent num
  // cliente não tem base de preço guardada → não soma (usar flat pra entrar aqui).
  const { data: nfCliData } = await supabase
    .from("clients")
    .select("nf_fee_type, nf_fee_value, deal_closed_at, updated_at")
    .eq("non_facilitator", true)
    .eq("is_buyer_seller", true)
    .is("archived_at", null);
  const nfClients = (nfCliData ?? []) as Array<Record<string, unknown>>;
  const nfCliAmount = (c: Record<string, unknown>): number =>
    (c.nf_fee_type as string) === "flat" ? n(c.nf_fee_value as number | null) : 0;
  const nfCliWhen = (c: Record<string, unknown>): string | null =>
    ((c.deal_closed_at as string) ?? (c.updated_at as string) ?? null);

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
  for (const l of soldListings) {
    const y = yearOf(l.sold_at);
    if (y) yearsSet.add(y);
  }
  for (const p of nfProps) {
    const y = yearOf(nfWhen(p));
    if (y) yearsSet.add(y);
  }
  for (const c of nfClients) {
    const y = yearOf(nfCliWhen(c));
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
  const general: Stream = { received: 0, pending: 0 };
  for (const iv of invoices) {
    const paidWhen = (iv.paid_date as string) ?? (iv.date as string);
    if (iv.kind === "seasonal") {
      const amt = n(iv.bythec_commission);
      if (!amt) continue;
      if (iv.paid) {
        if (match(paidWhen)) seasonal.received += amt;
      } else if (match(iv.date as string)) seasonal.pending += amt;
    } else if (iv.kind === "service") {
      // Ganho da By the C no service = a comissão de 10% (o resto é repasse ao
      // worker). Regime de caixa: entra quando a comissão é COLETADA.
      const amt = n(iv.service_commission);
      if (!amt) continue;
      if (iv.commission_collected) {
        const when = (iv.commission_collected_at as string) ?? paidWhen;
        if (match(when)) service.received += amt;
      } else if (match(iv.date as string)) service.pending += amt;
    } else if (iv.kind === "general") {
      // General = cobrança avulsa; o valor inteiro é receita da By the C.
      const amt = n(iv.general_total);
      if (!amt) continue;
      if (iv.paid) {
        if (match(paidWhen)) general.received += amt;
      } else if (match(iv.date as string)) general.pending += amt;
    }
  }

  // Venda não tem "owed": a comissão sai na mesa do fechamento. Casa vendida =
  // comissão ganha, contada no mês do fechamento. Por isso pending fica sempre 0.
  const sales: Stream = { received: 0, pending: 0 };
  for (const l of soldListings) {
    const amt = n(l.sale_commission);
    if (!amt || !match(l.sold_at)) continue;
    sales.received += amt;
  }

  // Non-facilitator: taxa única, sem "owed" (como venda).
  const nonFac: Stream = { received: 0, pending: 0 };
  for (const p of nfProps) {
    const amt = nfAmount(p);
    if (amt && match(nfWhen(p))) nonFac.received += amt;
  }
  for (const c of nfClients) {
    const amt = nfCliAmount(c);
    if (amt && match(nfCliWhen(c))) nonFac.received += amt;
  }

  const expensesTotal = expenses.reduce((s, e) => (match(e.date as string) ? s + n(e.price) : s), 0);

  const totalReceived =
    yearRound.received + seasonal.received + service.received + general.received + sales.received + nonFac.received;
  const totalPending =
    yearRound.pending + seasonal.pending + service.pending + general.pending + sales.pending;
  const net = totalReceived - expensesTotal;

  const listingsForYear = isAll
    ? soldListings
    : soldListings.filter((l) => yearOf(l.sold_at) === selYear);

  // ---- Monthly earnings (RECEIVED per period) ----
  // For a specific year: 12 months. For "All time": one row per year. Buckets by
  // when the money came in (received/paid/closed date).
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  type Row = { yr: number; seasonal: number; service: number; general: number; sales: number; nonfac: number };
  const buckets = new Map<string, Row>();
  const bucketKey = (s: string | null): string | null => {
    const y = yearOf(s);
    if (y == null) return null;
    if (isAll) return String(y);
    if (y !== selYear) return null;
    const m = Number(String(s).slice(5, 7));
    return m >= 1 && m <= 12 ? String(m) : null;
  };
  const addTo = (key: string | null, field: keyof Row, amt: number) => {
    if (key == null || !amt) return;
    const b = buckets.get(key) ?? { yr: 0, seasonal: 0, service: 0, general: 0, sales: 0, nonfac: 0 };
    b[field] += amt;
    buckets.set(key, b);
  };
  for (const p of payments) {
    if (p.status !== "received") continue;
    addTo(bucketKey((p.received_at as string) ?? (p.month as string) ?? (p.due_date as string)), "yr", n(p.commission));
  }
  for (const iv of invoices) {
    if (iv.kind === "seasonal") {
      if (!iv.paid) continue;
      const when = (iv.paid_date as string) ?? (iv.date as string);
      addTo(bucketKey(when), "seasonal", n(iv.bythec_commission));
    } else if (iv.kind === "service") {
      if (!iv.commission_collected) continue;
      const when = (iv.commission_collected_at as string) ?? (iv.paid_date as string) ?? (iv.date as string);
      addTo(bucketKey(when), "service", n(iv.service_commission));
    } else if (iv.kind === "general") {
      if (!iv.paid) continue;
      const when = (iv.paid_date as string) ?? (iv.date as string);
      addTo(bucketKey(when), "general", n(iv.general_total));
    }
  }
  for (const l of soldListings) {
    addTo(bucketKey(l.sold_at), "sales", n(l.sale_commission));
  }
  for (const p of nfProps) {
    addTo(bucketKey(nfWhen(p)), "nonfac", nfAmount(p));
  }
  for (const c of nfClients) {
    addTo(bucketKey(nfCliWhen(c)), "nonfac", nfCliAmount(c));
  }
  const periodRows = (
    isAll
      ? years.map((y) => ({ label: String(y), key: String(y) }))
      : MONTHS.map((m, i) => ({ label: m, key: String(i + 1) }))
  ).map(({ label, key }) => {
    const b = buckets.get(key) ?? { yr: 0, seasonal: 0, service: 0, general: 0, sales: 0, nonfac: 0 };
    return { label, ...b, total: b.yr + b.seasonal + b.service + b.general + b.sales + b.nonfac };
  });
  const maxPeriod = Math.max(1, ...periodRows.map((r) => r.total));
  const periodsTotal = periodRows.reduce((s, r) => s + r.total, 0);

  // owed:false = stream sem etapa de cobrança (venda fecha e paga na hora), então
  // o card não mostra uma coluna Owed que seria $0,00 pra sempre.
  const streams = [
    { key: "yr", label: "Year-round rent commission", icon: Home, s: yearRound, owed: true },
    { key: "seasonal", label: "Seasonal commission (Airbnb/VRBO)", icon: CalendarDays, s: seasonal, owed: true },
    { key: "service", label: "Service commission (10%)", icon: Hammer, s: service, owed: true },
    { key: "general", label: "General invoices", icon: FileText, s: general, owed: true },
    { key: "sales", label: "Sales commission", icon: KeyRound, s: sales, owed: false },
    { key: "nonfac", label: "Non-Client Facilitator fees", icon: TrendingUp, s: nonFac, owed: false },
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
        {streams.map(({ key, label, icon: Icon, s, owed }) => (
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
              {owed && (
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider text-ink/45">Owed</p>
                  <p className="text-lg font-semibold text-ink/70">{money(s.pending)}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Monthly (or yearly) earnings received */}
      <div className="mt-8">
        <h2 className="h-display mb-1 text-base text-ink">
          {isAll ? "Earnings by year" : `Monthly earnings · ${sel}`}
        </h2>
        <p className="mb-3 text-sm text-ink/55">Received by By the C each {isAll ? "year" : "month"}, by stream.</p>
        <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-4 py-3 font-bold">{isAll ? "Year" : "Month"}</th>
                <th className="px-4 py-3 text-right font-bold">Year-round</th>
                <th className="px-4 py-3 text-right font-bold">Seasonal</th>
                <th className="px-4 py-3 text-right font-bold">Service</th>
                <th className="px-4 py-3 text-right font-bold">General</th>
                <th className="px-4 py-3 text-right font-bold">Sales</th>
                <th className="px-4 py-3 text-right font-bold">Non-fac</th>
                <th className="px-4 py-3 text-right font-bold">Received</th>
              </tr>
            </thead>
            <tbody>
              {periodRows.map((r, i) => (
                <tr key={r.label} className={i % 2 === 1 ? "bg-black/[0.012]" : ""}>
                  <td className="px-4 py-2.5 font-medium text-ink/80">{r.label}</td>
                  <td className="px-4 py-2.5 text-right text-ink/60">{r.yr ? money(r.yr) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-ink/60">{r.seasonal ? money(r.seasonal) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-ink/60">{r.service ? money(r.service) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-ink/60">{r.general ? money(r.general) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-ink/60">{r.sales ? money(r.sales) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-ink/60">{r.nonfac ? money(r.nonfac) : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className="hidden h-1.5 rounded-full bg-primary/25 sm:block"
                        style={{ width: `${Math.round((r.total / maxPeriod) * 64)}px` }}
                      />
                      <span className={"font-semibold " + (r.total ? "text-primary" : "text-ink/30")}>
                        {r.total ? money(r.total) : "$0"}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/[0.08] bg-black/[0.02]">
                <td className="px-4 py-3 font-bold text-ink">Total</td>
                <td colSpan={6} />
                <td className="px-4 py-3 text-right font-bold text-primary">{money(periodsTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Sales commission entry */}
      <div className="mt-8">
        <h2 className="h-display mb-1 text-base text-ink">Sales commissions {isAll ? "" : `· ${sel}`}</h2>
        <p className="mb-3 text-sm text-ink/55">
          Every house you have sold, with the commission read straight off the listing. Set the
          price and commission once in Sales and it lands here.
        </p>
        <SalesCommissionsSection listings={listingsForYear} />
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
