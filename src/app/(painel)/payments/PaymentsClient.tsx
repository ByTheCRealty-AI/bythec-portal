"use client";

// Tela global /payments redesenhada em 3 abas (Due / Monthly / Past payments).
// Mostra SÓ aluguel mensal: kind in ('monthly','last_month'). Security deposit
// fica fora daqui (continua na aba da propriedade). last_month aparece inline
// como um aluguel comum, só com uma tag "Last month" pra distinguir.
//
// Filtragem 100% client-side (~900 linhas é tranquilo). As server actions
// (mark received / edit / delete / add) são reusadas das rows existentes.
import { useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CalendarDays,
  History,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { money, date, cx } from "@/lib/format";
import type { Payment, PaymentStatus } from "@/lib/types";
import type { PaymentPropertyOption } from "./PaymentAddForm";
import { PaymentAddForm } from "./PaymentAddForm";
import { PaymentRow } from "./PaymentsTable";

type TabKey = "due" | "monthly" | "past";

// ---- helpers de data (America/New_York) ------------------------------------

// "Hoje" em Cape Cod, como {year, month0} (month0 = 0..11). Usado pra calcular o
// primeiro dia do mês corrente e os limites das abas. Independe do fuso do server
// porque pede os campos formatados em America/New_York.
function nyToday(): { year: number; month0: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = Number(get("year"));
  const month0 = Number(get("month")) - 1;
  return { year, month0 };
}

// Converte um valor de data do banco (string YYYY-MM-DD ou ISO) em um comparável
// YYYY-MM-DD estável (sem deslocamento de fuso). Null/invalid → null.
function ymdOf(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Formata em NY pra manter consistência com o resto da tela.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Chave de mês YYYY-MM a partir de um YYYY-MM-DD.
function monthKeyOf(value: string | null | undefined): string | null {
  const ymd = ymdOf(value);
  return ymd ? ymd.slice(0, 7) : null;
}

// Rótulo amigável "June 2026" a partir de YYYY-MM.
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, 15)));
}

// Mês de competência preferindo `month`, com fallback em `due_date`.
function paymentMonthKey(p: Payment): string | null {
  return monthKeyOf(p.month) ?? monthKeyOf(p.due_date);
}

// Tag "Last month" reusável.
function LastMonthTag() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full border border-secondary/25 bg-secondary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary">
      Last month
    </span>
  );
}

// ---- Mark received (botão usado só na aba Due) ------------------------------
function MarkReceived({
  id,
  setStatus,
}: {
  id: string;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run() {
    setError(null);
    start(async () => {
      try {
        await setStatus(id, "received");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update. Try again.");
      }
    });
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.10] bg-white px-2.5 py-1.5 text-xs font-semibold text-ink/70 transition-all duration-200 hover:border-primary/40 hover:bg-primary/[0.04] hover:text-primary disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        Mark received
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  );
}

// ---- Célula de propriedade / inquilino (compartilhada) ---------------------
function PropertyCell({ p }: { p: Payment }) {
  const addr = p.property?.address ?? "—";
  return (
    <td className="px-5 py-3.5">
      {p.property ? (
        <Link
          href={`/propriedades/${p.property.id}`}
          className="font-semibold text-ink hover:text-primary"
        >
          {addr}
        </Link>
      ) : (
        <span className="font-semibold text-ink/60">{addr}</span>
      )}
      {p.property?.address2 && (
        <span className="block text-xs text-ink/45">{p.property.address2}</span>
      )}
    </td>
  );
}

function TenantCell({ p }: { p: Payment }) {
  return (
    <td className="px-5 py-3.5 text-ink/65">
      {p.tenant ? (
        <Link href={`/clientes/${p.tenant.id}`} className="hover:text-primary">
          {p.tenant.name}
        </Link>
      ) : (
        "—"
      )}
    </td>
  );
}

// ---- Chip de resumo (Due tab) ----------------------------------------------
function SummaryChip({
  tone,
  label,
  count,
  total,
  icon,
}: {
  tone: "danger" | "neutral";
  label: string;
  count: number;
  total: number;
  icon: ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-card",
        tone === "danger"
          ? "border-red-200 bg-red-50/60"
          : "border-black/[0.08] bg-white"
      )}
    >
      <div
        className={cx(
          "grid h-10 w-10 place-items-center rounded-xl",
          tone === "danger" ? "bg-red-100 text-red-600" : "bg-primary/10 text-primary"
        )}
      >
        {icon}
      </div>
      <div>
        <div
          className={cx(
            "text-xs font-semibold uppercase tracking-wider",
            tone === "danger" ? "text-red-600/80" : "text-ink/50"
          )}
        >
          {label}
        </div>
        <div className="text-sm font-bold text-ink">
          {count} {count === 1 ? "payment" : "payments"} ·{" "}
          <span className={tone === "danger" ? "text-red-600" : "text-ink"}>
            {money(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Linha enxuta da aba Due (sem edit/delete; só Mark received).
function DueRow({
  p,
  zebra,
  danger,
  setStatus,
}: {
  p: Payment;
  zebra: boolean;
  danger: boolean;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
}) {
  return (
    <tr className={cx("border-t border-black/[0.05] transition hover:bg-primary/[0.04]", zebra && "bg-black/[0.015]")}>
      <PropertyCell p={p} />
      <TenantCell p={p} />
      <td className="whitespace-nowrap px-5 py-3.5 text-ink/85">{money(p.rent_amount)}</td>
      <td className="whitespace-nowrap px-5 py-3.5">
        <span className={cx(danger ? "font-semibold text-red-600" : "text-ink/65")}>
          {date(p.due_date)}
        </span>
        {p.kind === "last_month" && <LastMonthTag />}
      </td>
      <td className="px-5 py-3.5 text-right">
        <MarkReceived id={p.id} setStatus={setStatus} />
      </td>
    </tr>
  );
}

// Linha enxuta da aba Past payments (received-only, read).
function PastRow({ p, zebra }: { p: Payment; zebra: boolean }) {
  const paid = p.received_at ?? p.due_date;
  return (
    <tr className={cx("border-t border-black/[0.05] transition hover:bg-primary/[0.04]", zebra && "bg-black/[0.015]")}>
      <PropertyCell p={p} />
      <TenantCell p={p} />
      <td className="whitespace-nowrap px-5 py-3.5 text-ink/85">{money(p.rent_amount)}</td>
      <td className="whitespace-nowrap px-5 py-3.5 text-ink/65">
        {date(paid)}
        {p.kind === "last_month" && <LastMonthTag />}
      </td>
    </tr>
  );
}

// ---- Componente principal --------------------------------------------------
export function PaymentsClient({
  payments,
  properties,
  canManage,
  addAction,
  setStatus,
  updateAction,
  deleteAction,
}: {
  payments: Payment[];
  properties: PaymentPropertyOption[];
  canManage: boolean;
  addAction: (fd: FormData) => void | Promise<void>;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  updateAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
}) {
  const [tab, setTab] = useState<TabKey>("due");

  const today = useMemo(() => nyToday(), []);
  const currentMonthKey = `${today.year}-${String(today.month0 + 1).padStart(2, "0")}`;
  const firstOfMonth = `${currentMonthKey}-01`;

  // ---- Due tab: due com due_date não-nulo, dividido em past due / this month.
  const { pastDue, dueThisMonth } = useMemo(() => {
    const past: Payment[] = [];
    const month: Payment[] = [];
    for (const p of payments) {
      if (p.status !== "due") continue;
      const ymd = ymdOf(p.due_date);
      if (!ymd) continue; // dateless dues nunca aparecem na aba Due
      if (ymd < firstOfMonth) past.push(p);
      else if (ymd.slice(0, 7) === currentMonthKey) month.push(p);
      // due_date futuro (mês seguinte+) não cai em nenhum dos dois grupos.
    }
    past.sort((a, b) => (ymdOf(a.due_date) ?? "").localeCompare(ymdOf(b.due_date) ?? "")); // mais antigo primeiro
    month.sort((a, b) => (ymdOf(a.due_date) ?? "").localeCompare(ymdOf(b.due_date) ?? ""));
    return { pastDue: past, dueThisMonth: month };
  }, [payments, firstOfMonth, currentMonthKey]);

  const pastDueTotal = pastDue.reduce((s, p) => s + (p.rent_amount ?? 0), 0);
  const dueThisMonthTotal = dueThisMonth.reduce((s, p) => s + (p.rent_amount ?? 0), 0);
  const dueCount = pastDue.length + dueThisMonth.length;

  // ---- Monthly tab: chips de mês distintos (mais recente primeiro).
  const monthKeys = useMemo(() => {
    const set = new Set<string>();
    for (const p of payments) {
      const k = paymentMonthKey(p);
      if (k) set.add(k);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a)); // desc
  }, [payments]);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(() => {
    if (monthKeys.includes(currentMonthKey)) return currentMonthKey;
    return monthKeys[0] ?? null;
  });

  const monthlyRows = useMemo(() => {
    if (!selectedMonth) return [] as Payment[];
    return payments
      .filter((p) => paymentMonthKey(p) === selectedMonth)
      .sort((a, b) => {
        // due primeiro, depois received; dentro, por due_date asc.
        if (a.status !== b.status) return a.status === "due" ? -1 : 1;
        return (ymdOf(a.due_date) ?? "").localeCompare(ymdOf(b.due_date) ?? "");
      });
  }, [payments, selectedMonth]);

  // ---- Past payments tab: received-only, filtro por range de mês.
  const defaultFrom = useMemo(() => {
    // 3 meses atrás (inclusive), em YYYY-MM.
    const d = new Date(Date.UTC(today.year, today.month0 - 3, 15));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, [today]);

  const [fromMonth, setFromMonth] = useState(defaultFrom);
  const [toMonth, setToMonth] = useState(currentMonthKey);

  const pastPayments = useMemo(() => {
    return payments
      .filter((p) => p.status === "received")
      .filter((p) => {
        const ref = monthKeyOf(p.received_at) ?? monthKeyOf(p.due_date);
        if (!ref) return false;
        if (fromMonth && ref < fromMonth) return false;
        if (toMonth && ref > toMonth) return false;
        return true;
      })
      .sort((a, b) => {
        const ra = ymdOf(a.received_at) ?? ymdOf(a.due_date) ?? "";
        const rb = ymdOf(b.received_at) ?? ymdOf(b.due_date) ?? "";
        return rb.localeCompare(ra); // mais novo primeiro
      });
  }, [payments, fromMonth, toMonth]);

  const tabs: Array<{ key: TabKey; label: string; icon: ReactNode; badge?: number }> = [
    { key: "due", label: "Due", icon: <CalendarClock className="h-4 w-4" />, badge: dueCount },
    { key: "monthly", label: "Monthly", icon: <CalendarDays className="h-4 w-4" /> },
    { key: "past", label: "Past payments", icon: <History className="h-4 w-4" /> },
  ];

  // colSpan da PaymentRow (aba Monthly): Address, Tenant, Kind, Month, Due,
  // Amount, Commission, Status, Receipt (+ actions). Igual à PaymentsTable.
  const monthlyColSpan = canManage ? 10 : 9;

  return (
    <>
      {/* Top bar: tabs + Add payment sempre visível */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1.5 rounded-2xl border border-black/[0.08] bg-white p-1 shadow-card">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cx(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200",
                  active
                    ? "bg-gradient-to-r from-primary to-secondary text-white shadow-[0_8px_24px_-10px_rgba(25,133,119,0.6)]"
                    : "text-ink/60 hover:bg-black/[0.03] hover:text-ink"
                )}
              >
                {t.icon}
                {t.label}
                {typeof t.badge === "number" && t.badge > 0 && (
                  <span
                    className={cx(
                      "ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                      active ? "bg-white/25 text-white" : "bg-secondary/15 text-secondary"
                    )}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {canManage && (
          <PaymentAddForm properties={properties} action={addAction} />
        )}
      </div>

      {/* ---- DUE TAB ---- */}
      {tab === "due" && (
        <div>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SummaryChip
              tone="danger"
              label="Past due"
              count={pastDue.length}
              total={pastDueTotal}
              icon={<AlertTriangle className="h-5 w-5" />}
            />
            <SummaryChip
              tone="neutral"
              label="Due this month"
              count={dueThisMonth.length}
              total={dueThisMonthTotal}
              icon={<CalendarClock className="h-5 w-5" />}
            />
          </div>

          {dueCount === 0 ? (
            <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-12 text-center text-sm text-ink/55 shadow-card">
              Nothing due right now. Every rent payment with a due date is in.
            </div>
          ) : (
            <div className="space-y-8">
              {pastDue.length > 0 && (
                <DueSection
                  title="Past due"
                  subtitle="Oldest first. These due dates are before this month."
                  rows={pastDue}
                  danger
                  setStatus={setStatus}
                />
              )}
              {dueThisMonth.length > 0 && (
                <DueSection
                  title="Due this month"
                  subtitle={monthLabel(currentMonthKey)}
                  rows={dueThisMonth}
                  danger={false}
                  setStatus={setStatus}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- MONTHLY TAB ---- */}
      {tab === "monthly" && (
        <div>
          {monthKeys.length === 0 ? (
            <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-12 text-center text-sm text-ink/55 shadow-card">
              No rent payments recorded yet.
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {monthKeys.map((k) => {
                  const active = selectedMonth === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSelectedMonth(k)}
                      className={cx(
                        "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
                        active
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-black/10 bg-white text-ink/60 hover:border-black/20 hover:text-ink"
                      )}
                    >
                      {monthLabel(k)}
                    </button>
                  );
                })}
              </div>

              {monthlyRows.length === 0 ? (
                <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-12 text-center text-sm text-ink/55 shadow-card">
                  No payments in {selectedMonth ? monthLabel(selectedMonth) : "this month"}.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
                      <tr>
                        <th className="px-5 py-3 font-bold">Property</th>
                        <th className="px-5 py-3 font-bold">Tenant</th>
                        <th className="px-5 py-3 font-bold">Kind</th>
                        <th className="px-5 py-3 font-bold">Month</th>
                        <th className="px-5 py-3 font-bold">Due</th>
                        <th className="px-5 py-3 font-bold">Amount</th>
                        <th className="px-5 py-3 font-bold">Commission</th>
                        <th className="px-5 py-3 font-bold">Status</th>
                        <th className="px-5 py-3 font-bold">Receipt</th>
                        {canManage && <th className="px-5 py-3" />}
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyRows.map((p, i) => (
                        <PaymentRow
                          key={p.id}
                          payment={p}
                          properties={properties}
                          canManage={canManage}
                          zebra={i % 2 === 1}
                          colSpan={monthlyColSpan}
                          setStatus={setStatus}
                          updateAction={updateAction}
                          deleteAction={deleteAction}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ---- PAST PAYMENTS TAB ---- */}
      {tab === "past" && (
        <div>
          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-2xl border border-black/[0.08] bg-white p-4 shadow-card">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                From
              </span>
              <input
                type="month"
                value={fromMonth}
                max={toMonth}
                onChange={(e) => setFromMonth(e.target.value)}
                className="rounded-xl border border-black/[0.12] bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                To
              </span>
              <input
                type="month"
                value={toMonth}
                min={fromMonth}
                onChange={(e) => setToMonth(e.target.value)}
                className="rounded-xl border border-black/[0.12] bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <span className="pb-2 text-xs text-ink/45">
              {pastPayments.length}{" "}
              {pastPayments.length === 1 ? "payment" : "payments"} ·{" "}
              {money(pastPayments.reduce((s, p) => s + (p.rent_amount ?? 0), 0))}
            </span>
          </div>

          {pastPayments.length === 0 ? (
            <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-12 text-center text-sm text-ink/55 shadow-card">
              No received payments in this date range.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
              <table className="w-full text-left text-sm">
                <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
                  <tr>
                    <th className="px-5 py-3 font-bold">Property</th>
                    <th className="px-5 py-3 font-bold">Tenant</th>
                    <th className="px-5 py-3 font-bold">Amount</th>
                    <th className="px-5 py-3 font-bold">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {pastPayments.map((p, i) => (
                    <PastRow key={p.id} p={p} zebra={i % 2 === 1} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// Bloco de tabela enxuta da aba Due (uma seção: past due ou due this month).
function DueSection({
  title,
  subtitle,
  rows,
  danger,
  setStatus,
}: {
  title: string;
  subtitle: string;
  rows: Payment[];
  danger: boolean;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className={cx("h-display text-lg", danger ? "text-red-600" : "text-ink")}>{title}</h2>
        <span className="text-xs text-ink/45">{subtitle}</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-5 py-3 font-bold">Property</th>
              <th className="px-5 py-3 font-bold">Tenant</th>
              <th className="px-5 py-3 font-bold">Amount</th>
              <th className="px-5 py-3 font-bold">Due date</th>
              <th className="px-5 py-3 text-right font-bold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <DueRow
                key={p.id}
                p={p}
                zebra={i % 2 === 1}
                danger={danger}
                setStatus={setStatus}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
