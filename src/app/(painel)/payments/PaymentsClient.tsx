"use client";

// Tela global /payments redesenhada em 4 abas (Due / Monthly / Past payments /
// Security deposit). As três primeiras mostram SÓ aluguel: kind in
// ('monthly','first_month','last_month'). first_month e last_month aparecem inline
// como um aluguel comum, só com uma tag ("First month" / "Last month") pra
// distinguir. A aba Security deposit mostra SÓ security_deposit, agrupado por
// installment_group (um depósito = N parcelas).
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
  ShieldCheck,
  Pencil,
  Trash2,
  X,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { money, date, cx } from "@/lib/format";
import { Field, inputClass, buttonClass } from "@/components/ui";
import type { Payment, PaymentKind, PaymentStatus } from "@/lib/types";
import type { PaymentPropertyOption } from "./PaymentAddForm";
import { PaymentAddForm } from "./PaymentAddForm";
import { PaymentRow, CommissionPaidToggle } from "./PaymentsTable";
import { RentInstallmentsPanel } from "./RentInstallmentsPanel";

type TabKey = "due" | "monthly" | "past" | "deposit";

// Rent kinds shown in the Due / Monthly / Past tabs (security_deposit excluded —
// it has its own tab).
const RENT_KINDS: PaymentKind[] = ["monthly", "first_month", "last_month"];
function isRentKind(p: Payment): boolean {
  return RENT_KINDS.includes(p.kind);
}

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

// Tag pra distinguir first_month / last_month inline nas abas de aluguel.
// monthly não recebe tag (é o caso padrão).
function KindTag({ kind }: { kind: PaymentKind }) {
  if (kind !== "first_month" && kind !== "last_month") return null;
  const label = kind === "first_month" ? "First month" : "Last month";
  return (
    <span className="ml-2 inline-flex items-center rounded-full border border-secondary/25 bg-secondary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary">
      {label}
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
  icon,
}: {
  tone: "danger" | "neutral";
  label: string;
  count: number;
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
          {count} {count === 1 ? "payment" : "payments"}
        </div>
      </div>
    </div>
  );
}

// Linha da aba Due. Mostra "Partial" + progresso quando há pagamento parcial, e
// (pra aluguel) um toggle que abre o painel de parcelas pra registrar pagamentos.
function DueRow({
  p,
  zebra,
  danger,
  canManage,
  setStatus,
  addPartAction,
  updatePartAction,
  deletePartAction,
  setCommissionPaid,
}: {
  p: Payment;
  zebra: boolean;
  danger: boolean;
  canManage: boolean;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  addPartAction: (fd: FormData) => void | Promise<void>;
  updatePartAction: (fd: FormData) => void | Promise<void>;
  deletePartAction: (fd: FormData) => void | Promise<void>;
  setCommissionPaid: (id: string, paid: boolean) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const paid = p.amount_paid ?? 0;
  const rent = p.rent_amount ?? 0;
  const remaining = Math.max(0, rent - paid);
  const isPartial = paid > 0;
  const pct = rent > 0 ? Math.min(100, Math.round((paid / rent) * 100)) : 0;
  const canParts = canManage && isRentKind(p);

  return (
    <>
      <tr className={cx("border-t border-black/[0.05] transition hover:bg-primary/[0.04]", zebra && "bg-black/[0.015]")}>
        <PropertyCell p={p} />
        <TenantCell p={p} />
        <td className="whitespace-nowrap px-5 py-3.5 text-ink/85">
          {money(p.rent_amount)}
          {isPartial && (
            <span className="mt-1 block">
              <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                Partial
              </span>
              <span className="mt-0.5 block text-[11px] text-ink/50">
                {money(paid)} in · {money(remaining)} left
              </span>
              <span className="mt-1 block h-1.5 w-28 overflow-hidden rounded-full bg-black/[0.06]">
                <span className="block h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
              </span>
            </span>
          )}
        </td>
        <td className="whitespace-nowrap px-5 py-3.5">
          <span className={cx(danger ? "font-semibold text-red-600" : "text-ink/65")}>
            {date(p.due_date)}
          </span>
          <KindTag kind={p.kind} />
        </td>
        <td className="px-5 py-3.5 text-right">
          <div className="inline-flex flex-wrap items-center justify-end gap-2">
            {p.commission != null && p.commission > 0 && (
              <CommissionPaidToggle payment={p} setCommissionPaid={setCommissionPaid} />
            )}
            {canParts && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-black/[0.10] bg-white px-2 py-1.5 text-xs font-semibold text-ink/70 transition hover:border-primary/40 hover:text-primary"
                aria-expanded={expanded}
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {isPartial ? "Payments" : "Record payment"}
              </button>
            )}
            <MarkReceived id={p.id} setStatus={setStatus} />
          </div>
        </td>
      </tr>
      {canParts && expanded && (
        <tr className="border-t border-black/[0.05] bg-black/[0.015]">
          <td colSpan={5} className="px-5 py-4">
            <RentInstallmentsPanel
              payment={p}
              canManage={canManage}
              addPartAction={addPartAction}
              updatePartAction={updatePartAction}
              deletePartAction={deletePartAction}
            />
          </td>
        </tr>
      )}
    </>
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
        <KindTag kind={p.kind} />
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
  depositAction,
  setStatus,
  updateAction,
  deleteAction,
  updateDepositTotalAction,
  deleteDepositGroupAction,
  addPartAction,
  updatePartAction,
  deletePartAction,
  setCommissionPaid,
}: {
  payments: Payment[];
  properties: PaymentPropertyOption[];
  canManage: boolean;
  addAction: (fd: FormData) => void | Promise<void>;
  depositAction: (fd: FormData) => void | Promise<void>;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  updateAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
  updateDepositTotalAction: (fd: FormData) => void | Promise<void>;
  deleteDepositGroupAction: (fd: FormData) => void | Promise<void>;
  addPartAction: (fd: FormData) => void | Promise<void>;
  updatePartAction: (fd: FormData) => void | Promise<void>;
  deletePartAction: (fd: FormData) => void | Promise<void>;
  setCommissionPaid: (id: string, paid: boolean) => Promise<void>;
}) {
  const [tab, setTab] = useState<TabKey>("due");

  // Rent (Due/Monthly/Past) vs deposits (own tab). Split once, up front.
  const rentPayments = useMemo(() => payments.filter(isRentKind), [payments]);
  const depositPayments = useMemo(
    () => payments.filter((p) => p.kind === "security_deposit"),
    [payments]
  );

  const today = useMemo(() => nyToday(), []);
  const currentMonthKey = `${today.year}-${String(today.month0 + 1).padStart(2, "0")}`;
  const firstOfMonth = `${currentMonthKey}-01`;

  // ---- Due tab: due com due_date não-nulo, dividido em past due / this month.
  const { pastDue, dueThisMonth } = useMemo(() => {
    const past: Payment[] = [];
    const month: Payment[] = [];
    for (const p of rentPayments) {
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
  }, [rentPayments, firstOfMonth, currentMonthKey]);

  const dueCount = pastDue.length + dueThisMonth.length;

  // ---- Monthly tab: chips de mês distintos (mais recente primeiro).
  const monthKeys = useMemo(() => {
    const set = new Set<string>();
    for (const p of rentPayments) {
      const k = paymentMonthKey(p);
      if (k) set.add(k);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a)); // desc
  }, [rentPayments]);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(() => {
    if (monthKeys.includes(currentMonthKey)) return currentMonthKey;
    return monthKeys[0] ?? null;
  });

  const monthlyRows = useMemo(() => {
    if (!selectedMonth) return [] as Payment[];
    return rentPayments
      .filter((p) => paymentMonthKey(p) === selectedMonth)
      .sort((a, b) => {
        // due primeiro, depois received; dentro, por due_date asc.
        if (a.status !== b.status) return a.status === "due" ? -1 : 1;
        return (ymdOf(a.due_date) ?? "").localeCompare(ymdOf(b.due_date) ?? "");
      });
  }, [rentPayments, selectedMonth]);

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
    return rentPayments
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
  }, [rentPayments, fromMonth, toMonth]);

  // ---- Security deposit tab: agrupa por installment_group. Depósitos legados
  // sem grupo (linha única) viram um "grupo" próprio com a key do próprio id.
  const depositGroups = useMemo(() => {
    const map = new Map<string, Payment[]>();
    for (const p of depositPayments) {
      const key = p.installment_group ?? `single:${p.id}`;
      const arr = map.get(key);
      if (arr) arr.push(p);
      else map.set(key, [p]);
    }
    const groups = Array.from(map.entries()).map(([key, items]) => {
      // Parcelas em ordem: por installment_no quando houver, senão por due_date.
      const sorted = [...items].sort((a, b) => {
        const an = a.installment_no ?? 0;
        const bn = b.installment_no ?? 0;
        if (an !== bn) return an - bn;
        return (ymdOf(a.due_date) ?? "").localeCompare(ymdOf(b.due_date) ?? "");
      });
      const total = sorted.reduce((sum, p) => sum + (p.rent_amount ?? 0), 0);
      const received = sorted.filter((p) => p.status === "received");
      const receivedTotal = received.reduce((sum, p) => sum + (p.rent_amount ?? 0), 0);
      return {
        key,
        items: sorted,
        total,
        receivedCount: received.length,
        receivedTotal,
        // Pra ordenar grupos: due_date da primeira parcela.
        sortRef: ymdOf(sorted[0]?.due_date) ?? "",
      };
    });
    // Grupos com parcela em aberto primeiro; dentro, mais recente por due_date.
    groups.sort((a, b) => {
      const aOpen = a.receivedCount < a.items.length;
      const bOpen = b.receivedCount < b.items.length;
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return b.sortRef.localeCompare(a.sortRef);
    });
    return groups;
  }, [depositPayments]);

  const tabs: Array<{ key: TabKey; label: string; icon: ReactNode; badge?: number }> = [
    { key: "due", label: "Due", icon: <CalendarClock className="h-4 w-4" />, badge: dueCount },
    { key: "monthly", label: "Monthly", icon: <CalendarDays className="h-4 w-4" /> },
    { key: "past", label: "Past payments", icon: <History className="h-4 w-4" /> },
    {
      key: "deposit",
      label: "Security deposit",
      icon: <ShieldCheck className="h-4 w-4" />,
      badge: depositGroups.length,
    },
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
          <PaymentAddForm
            properties={properties}
            action={addAction}
            depositAction={depositAction}
          />
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
              icon={<AlertTriangle className="h-5 w-5" />}
            />
            <SummaryChip
              tone="neutral"
              label="Due this month"
              count={dueThisMonth.length}
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
                  canManage={canManage}
                  setStatus={setStatus}
                  addPartAction={addPartAction}
                  updatePartAction={updatePartAction}
                  deletePartAction={deletePartAction}
                  setCommissionPaid={setCommissionPaid}
                />
              )}
              {dueThisMonth.length > 0 && (
                <DueSection
                  title="Due this month"
                  subtitle={monthLabel(currentMonthKey)}
                  rows={dueThisMonth}
                  danger={false}
                  canManage={canManage}
                  setStatus={setStatus}
                  addPartAction={addPartAction}
                  updatePartAction={updatePartAction}
                  deletePartAction={deletePartAction}
                  setCommissionPaid={setCommissionPaid}
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
                          addPartAction={addPartAction}
                          updatePartAction={updatePartAction}
                          deletePartAction={deletePartAction}
                          setCommissionPaid={setCommissionPaid}
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
              {pastPayments.length === 1 ? "payment" : "payments"}
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

      {/* ---- SECURITY DEPOSIT TAB ---- */}
      {tab === "deposit" && (
        <div>
          {depositGroups.length === 0 ? (
            <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-12 text-center text-sm text-ink/55 shadow-card">
              No security deposits yet. Add one with “Add payment” and pick the
              Security deposit kind to split it into installments.
            </div>
          ) : (
            <div className="space-y-5">
              {depositGroups.map((g) => (
                <DepositGroupCard
                  key={g.key}
                  group={g}
                  canManage={canManage}
                  setStatus={setStatus}
                  updateAction={updateAction}
                  updateDepositTotalAction={updateDepositTotalAction}
                  deleteDepositGroupAction={deleteDepositGroupAction}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ---- Security deposit: card por grupo (um depósito) ------------------------
type DepositGroup = {
  key: string;
  items: Payment[];
  total: number;
  receivedCount: number;
  receivedTotal: number;
  sortRef: string;
};

function DepositGroupCard({
  group,
  canManage,
  setStatus,
  updateAction,
  updateDepositTotalAction,
  deleteDepositGroupAction,
}: {
  group: DepositGroup;
  canManage: boolean;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  updateAction: (fd: FormData) => void | Promise<void>;
  updateDepositTotalAction: (fd: FormData) => void | Promise<void>;
  deleteDepositGroupAction: (fd: FormData) => void | Promise<void>;
}) {
  const first = group.items[0];
  const totalInstallments = first?.installment_total ?? group.items.length;
  const complete = group.receivedCount >= group.items.length;

  // Identidade do depósito pras actions de grupo: UUID do grupo quando houver,
  // senão a linha legada única (id). Sempre manda os dois campos; a action usa o
  // que vier preenchido.
  const groupId = first?.installment_group ?? null;
  const singleId = groupId ? null : first?.id ?? null;

  const [editingTotal, setEditingTotal] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-card">
      {/* Cabeçalho do depósito: propriedade / inquilino / total / progresso */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[0.06] bg-black/[0.015] px-5 py-4">
        <div>
          {first?.property ? (
            <Link
              href={`/propriedades/${first.property.id}`}
              className="font-bold text-ink hover:text-primary"
            >
              {first.property.address}
            </Link>
          ) : (
            <span className="font-bold text-ink/60">—</span>
          )}
          {first?.property?.address2 && (
            <span className="block text-xs text-ink/45">{first.property.address2}</span>
          )}
          <span className="mt-0.5 block text-sm text-ink/60">
            {first?.tenant ? (
              <Link href={`/clientes/${first.tenant.id}`} className="hover:text-primary">
                {first.tenant.name}
              </Link>
            ) : (
              "—"
            )}
          </span>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="text-lg font-bold text-ink">{money(group.total)}</div>
            <div
              className={cx(
                "mt-0.5 text-xs font-semibold",
                complete ? "text-primary" : "text-ink/55"
              )}
            >
              {group.receivedCount} of {group.items.length} received ·{" "}
              {money(group.receivedTotal)} of {money(group.total)}
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingTotal((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.10] bg-white px-2.5 py-1.5 text-xs font-semibold text-ink/70 transition-all duration-200 hover:border-primary/40 hover:bg-primary/[0.04] hover:text-primary"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit total
              </button>
              <DeleteDeposit
                groupId={groupId}
                singleId={singleId}
                deleteDepositGroupAction={deleteDepositGroupAction}
              />
            </div>
          )}
        </div>
      </div>

      {/* Editor do total: re-divide entre as parcelas existentes (mesmas datas). */}
      {editingTotal && canManage && (
        <div className="border-b border-black/[0.06] bg-primary/[0.03] px-5 py-4">
          <form
            action={async (fd) => {
              await updateDepositTotalAction(fd);
              setEditingTotal(false);
            }}
            className="flex flex-wrap items-end gap-3"
          >
            {groupId && <input type="hidden" name="installment_group" value={groupId} />}
            {singleId && <input type="hidden" name="id" value={singleId} />}
            <Field label="New total (USD)">
              <input
                name="deposit_total"
                type="number"
                step="0.01"
                min={0}
                defaultValue={group.total || ""}
                autoFocus
                className={inputClass}
              />
            </Field>
            <button type="submit" className={buttonClass("primary")}>
              Save total
            </button>
            <button
              type="button"
              onClick={() => setEditingTotal(false)}
              className={buttonClass("ghost")}
            >
              Cancel
            </button>
            <span className="w-full text-xs text-ink/45">
              The new total is re-split across the {group.items.length}{" "}
              {group.items.length === 1 ? "installment" : "installments"}, keeping the
              same due dates.
            </span>
          </form>
        </div>
      )}

      {/* Lista de parcelas */}
      <table className="w-full text-left text-sm">
        <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
          <tr>
            <th className="px-5 py-3 font-bold">Installment</th>
            <th className="px-5 py-3 font-bold">Amount</th>
            <th className="px-5 py-3 font-bold">Due date</th>
            <th className="px-5 py-3 font-bold">Status</th>
            {canManage && <th className="px-5 py-3 text-right font-bold">Action</th>}
          </tr>
        </thead>
        <tbody>
          {group.items.map((p, i) => (
            <DepositInstallmentRow
              key={p.id}
              p={p}
              totalInstallments={totalInstallments}
              indexInGroup={i}
              zebra={i % 2 === 1}
              canManage={canManage}
              setStatus={setStatus}
              updateAction={updateAction}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Uma parcela de depósito. Mark received (reusa setStatus) + edição inline de
// valor/data (reusa updateAction). A edição manda os campos que a action espera
// (id, property_id, kind, status, due_date, month, rent_amount) preservando o
// agrupamento — installment_no/total/group não mudam (não são tocados na update).
function DepositInstallmentRow({
  p,
  totalInstallments,
  indexInGroup,
  zebra,
  canManage,
  setStatus,
  updateAction,
}: {
  p: Payment;
  totalInstallments: number;
  indexInGroup: number;
  zebra: boolean;
  canManage: boolean;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  updateAction: (fd: FormData) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const no = p.installment_no ?? indexInGroup + 1;
  const total = p.installment_total ?? totalInstallments;

  if (editing && canManage) {
    return (
      <tr className="border-t border-black/[0.05] bg-primary/[0.03]">
        <td colSpan={5} className="px-5 py-4">
          <form
            action={async (fd) => {
              await updateAction(fd);
              setEditing(false);
            }}
            className="space-y-4"
          >
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="property_id" value={p.property_id} />
            <input type="hidden" name="kind" value="security_deposit" />
            <input type="hidden" name="status" value={p.status} />
            <input type="hidden" name="month" value={p.month ?? ""} />
            <input type="hidden" name="notes" value={p.notes ?? ""} />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Amount (USD)">
                <input
                  name="rent_amount"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={p.rent_amount ?? ""}
                  className={inputClass}
                />
              </Field>
              <Field label="Due date">
                <input
                  name="due_date"
                  type="date"
                  defaultValue={p.due_date ?? ""}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="flex gap-3">
              <button type="submit" className={buttonClass("primary")}>
                Save installment
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className={buttonClass("ghost")}
              >
                Cancel
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr
      className={cx(
        "border-t border-black/[0.05] transition hover:bg-primary/[0.04]",
        zebra && "bg-black/[0.015]"
      )}
    >
      <td className="px-5 py-3.5 font-semibold text-ink/85">
        Installment {no} of {total}
      </td>
      <td className="whitespace-nowrap px-5 py-3.5 text-ink/85">{money(p.rent_amount)}</td>
      <td className="whitespace-nowrap px-5 py-3.5 text-ink/65">{date(p.due_date)}</td>
      <td className="px-5 py-3.5">
        {p.status === "received" ? (
          <span className="inline-flex flex-col items-start gap-0.5">
            <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Received
            </span>
            {p.received_at && (
              <span className="text-[11px] text-ink/45">{date(p.received_at)}</span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-secondary/25 bg-secondary/10 px-2.5 py-0.5 text-xs font-semibold text-secondary">
            Due
          </span>
        )}
      </td>
      {canManage && (
        <td className="px-5 py-3.5">
          <div className="flex items-center justify-end gap-2">
            {p.status === "due" ? (
              <MarkReceived id={p.id} setStatus={setStatus} />
            ) : (
              <MarkDeposit id={p.id} setStatus={setStatus} />
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.10] bg-white px-2.5 py-1.5 text-xs font-semibold text-ink/70 transition-all duration-200 hover:border-primary/40 hover:bg-primary/[0.04] hover:text-primary"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

// Reverter uma parcela recebida pra due (regime de caixa). Espelha MarkReceived.
function MarkDeposit({
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
        await setStatus(id, "due");
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
        className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.10] bg-white px-2.5 py-1.5 text-xs font-semibold text-ink/70 transition-all duration-200 hover:border-secondary/40 hover:bg-secondary/[0.05] hover:text-secondary disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        Mark due
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  );
}

// Deleta o depósito inteiro (todas as parcelas do grupo). Dois passos: o primeiro
// clique pede confirmação inline, o segundo manda. Reusa a action de grupo.
function DeleteDeposit({
  groupId,
  singleId,
  deleteDepositGroupAction,
}: {
  groupId: string | null;
  singleId: string | null;
  deleteDepositGroupAction: (fd: FormData) => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    const fd = new FormData();
    if (groupId) fd.set("installment_group", groupId);
    if (singleId) fd.set("id", singleId);
    start(async () => {
      try {
        await deleteDepositGroupAction(fd);
        // Sucesso: o revalidate remonta a lista sem este card.
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete. Try again.");
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-all duration-200 hover:border-red-300 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-red-700 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        Delete whole deposit
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg border border-black/[0.10] bg-white px-2 py-1.5 text-xs font-semibold text-ink/60 hover:bg-black/[0.03] disabled:opacity-60"
      >
        <X className="h-3.5 w-3.5" /> Cancel
      </button>
    </span>
  );
}

// Bloco de tabela enxuta da aba Due (uma seção: past due ou due this month).
function DueSection({
  title,
  subtitle,
  rows,
  danger,
  canManage,
  setStatus,
  addPartAction,
  updatePartAction,
  deletePartAction,
  setCommissionPaid,
}: {
  title: string;
  subtitle: string;
  rows: Payment[];
  danger: boolean;
  canManage: boolean;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  addPartAction: (fd: FormData) => void | Promise<void>;
  updatePartAction: (fd: FormData) => void | Promise<void>;
  deletePartAction: (fd: FormData) => void | Promise<void>;
  setCommissionPaid: (id: string, paid: boolean) => Promise<void>;
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
                canManage={canManage}
                setStatus={setStatus}
                addPartAction={addPartAction}
                updatePartAction={updatePartAction}
                deletePartAction={deletePartAction}
                setCommissionPaid={setCommissionPaid}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
