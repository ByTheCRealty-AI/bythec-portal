"use client";

// Tabela de pagamentos (year-round / off-season) com filtros de status e kind,
// busca por endereço + inquilino, e ações por linha: toggle de status (regime de
// caixa), delete com confirmação leve, e edição inline. Mesmo visual das outras
// telas (zebra rows, chips, glass forms).
import { useState, useTransition } from "react";
import Link from "next/link";
import { Search, CheckCircle2, Undo2, Loader2, ChevronRight, ChevronDown, Square, CheckSquare } from "lucide-react";
import { Badge, Field, inputClass, buttonClass } from "@/components/ui";
import { EditButton, DeleteControl } from "@/components/inline-forms/InlineRowControls";
import { PaymentReceipt } from "./PaymentReceipt";
import { RentInstallmentsPanel } from "./RentInstallmentsPanel";
import { money, date, cx } from "@/lib/format";
import {
  PAYMENT_KIND_LABEL,
  PAYMENT_STATUS_LABEL,
  type Payment,
  type PaymentKind,
  type PaymentStatus,
} from "@/lib/types";
import type { PaymentPropertyOption } from "./PaymentAddForm";

type StatusFilter = "" | PaymentStatus;
type KindFilter = "" | PaymentKind;

function StatusBadge({ payment }: { payment: Payment }) {
  if (payment.status === "received") {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          Received
        </span>
        {payment.received_at && (
          <span className="text-[11px] text-ink/45">{date(payment.received_at)}</span>
        )}
      </span>
    );
  }
  // Partial: still due, but some money is in. Amber, with the running total.
  const paid = payment.amount_paid ?? 0;
  if (paid > 0) {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          Partial
        </span>
        <span className="text-[11px] text-ink/45">
          {money(paid)} of {money(payment.rent_amount)}
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-secondary/25 bg-secondary/10 px-2.5 py-0.5 text-xs font-semibold text-secondary">
      Due
    </span>
  );
}

// Rent kinds can be paid in installments; security deposit has its own tab.
const RENT_KINDS_FOR_PARTS = new Set(["monthly", "first_month", "last_month"]);
function supportsParts(p: Payment): boolean {
  return RENT_KINDS_FOR_PARTS.has(p.kind);
}

// Checkbox pra marcar a comissão da By the C como paga/liquidada. Carimba a data
// ao marcar (server). Otimista via transition; erro reverte + mostra mensagem.
function CommissionPaidToggle({
  payment,
  setCommissionPaid,
}: {
  payment: Payment;
  setCommissionPaid: (id: string, paid: boolean) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const paid = payment.commission_paid;

  function run() {
    setError(null);
    start(async () => {
      try {
        await setCommissionPaid(payment.id, !paid);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update. Try again.");
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold transition disabled:opacity-60",
          paid
            ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/[0.15]"
            : "border-black/[0.12] bg-white text-ink/55 hover:border-primary/40 hover:text-primary"
        )}
        title={paid ? "Commission paid — click to undo" : "Mark commission as paid"}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : paid ? (
          <CheckSquare className="h-3.5 w-3.5" />
        ) : (
          <Square className="h-3.5 w-3.5" />
        )}
        {paid ? "Commission paid" : "Mark paid"}
      </button>
      {paid && payment.commission_paid_at && (
        <span className="text-[10px] text-ink/45">{date(payment.commission_paid_at)}</span>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  );
}

function kindTone(k: PaymentKind): "gold" | "orange" | "neutral" {
  if (k === "security_deposit") return "gold";
  if (k === "last_month") return "orange";
  return "neutral";
}

// Botão de toggle de status (Mark received / Mark due). Otimista via transition;
// erro volta o estado e mostra a mensagem.
function StatusToggle({
  payment,
  setStatus,
}: {
  payment: Payment;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next: PaymentStatus = payment.status === "received" ? "due" : "received";

  function run() {
    setError(null);
    start(async () => {
      try {
        await setStatus(payment.id, next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update. Try again.");
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 disabled:opacity-60",
          next === "received"
            ? "border-black/[0.10] bg-white text-ink/70 hover:border-primary/40 hover:bg-primary/[0.04] hover:text-primary"
            : "border-black/[0.10] bg-white text-ink/70 hover:border-secondary/40 hover:bg-secondary/[0.05] hover:text-secondary"
        )}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : next === "received" ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <Undo2 className="h-3.5 w-3.5" />
        )}
        {next === "received" ? "Mark received" : "Mark due"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  );
}

// Linha em modo edição: form inline espelhando o PaymentAddForm.
// hideProperty: usado na aba da propriedade — o property_id é travado (hidden) e
// o picker some (a propriedade é implícita).
function EditRow({
  payment,
  properties,
  colSpan,
  updateAction,
  onDone,
  hideProperty = false,
}: {
  payment: Payment;
  properties: PaymentPropertyOption[];
  colSpan: number;
  updateAction: (fd: FormData) => void | Promise<void>;
  onDone: () => void;
  hideProperty?: boolean;
}) {
  return (
    <tr className="border-t border-black/[0.05] bg-primary/[0.03]">
      <td colSpan={colSpan} className="px-5 py-4">
        <form
          action={async (fd) => {
            await updateAction(fd);
            onDone();
          }}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={payment.id} />

          {hideProperty ? (
            <input type="hidden" name="property_id" value={payment.property_id} />
          ) : (
            <Field label="Property *">
              <select
                name="property_id"
                required
                defaultValue={payment.property_id}
                className={inputClass}
              >
                {/* Garante que a propriedade atual aparece mesmo se arquivada/de outro tipo. */}
                {payment.property &&
                  !properties.some((p) => p.id === payment.property_id) && (
                    <option value={payment.property_id}>
                      {payment.property.address}
                      {payment.property.address2 ? ` · ${payment.property.address2}` : ""}
                    </option>
                  )}
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.address}
                    {p.address2 ? ` · ${p.address2}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Kind">
              <select name="kind" defaultValue={payment.kind} className={inputClass}>
                {Object.entries(PAYMENT_KIND_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={payment.status} className={inputClass}>
                {Object.entries(PAYMENT_STATUS_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Month">
              <input
                name="month"
                type="date"
                defaultValue={payment.month ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Due date">
              <input
                name="due_date"
                type="date"
                defaultValue={payment.due_date ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Amount (USD)">
              <input
                name="rent_amount"
                type="number"
                step="0.01"
                min={0}
                defaultValue={payment.rent_amount ?? ""}
                className={inputClass}
                placeholder="2500.00"
              />
            </Field>
            <Field
              label="Commission (USD)"
              hint="By the C year-round commission is 10% of monthly rent, counted when received."
            >
              <input
                name="commission"
                type="number"
                step="0.01"
                min={0}
                defaultValue={payment.commission ?? ""}
                className={inputClass}
                placeholder="Optional"
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              name="notes"
              rows={2}
              defaultValue={payment.notes ?? ""}
              className={inputClass}
              placeholder="Optional — e.g. paid by Zelle, partial payment…"
            />
          </Field>

          <div className="flex gap-3">
            <button type="submit" className={buttonClass("primary")}>
              Save payment
            </button>
            <button type="button" onClick={onDone} className={buttonClass("ghost")}>
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

// Linha de pagamento. hideProperty: oculta as colunas Property + Tenant (usado
// na aba da propriedade, onde a propriedade é implícita).
export function PaymentRow({
  payment,
  properties,
  canManage,
  zebra,
  colSpan,
  setStatus,
  updateAction,
  deleteAction,
  hideProperty = false,
  addPartAction,
  updatePartAction,
  deletePartAction,
  setCommissionPaid,
}: {
  payment: Payment;
  properties: PaymentPropertyOption[];
  canManage: boolean;
  zebra: boolean;
  colSpan: number;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  updateAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
  hideProperty?: boolean;
  // Partial-payment actions. When provided (and the kind is rent), the row gets
  // an expand toggle that reveals the installments panel. Optional so consumers
  // that don't manage partials (e.g. read-only contexts) keep working.
  addPartAction?: (fd: FormData) => void | Promise<void>;
  updatePartAction?: (fd: FormData) => void | Promise<void>;
  deletePartAction?: (fd: FormData) => void | Promise<void>;
  // Toggle "commission paid". Optional so read-only contexts skip it.
  setCommissionPaid?: (id: string, paid: boolean) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (editing) {
    return (
      <EditRow
        payment={payment}
        properties={properties}
        colSpan={colSpan}
        updateAction={updateAction}
        onDone={() => setEditing(false)}
        hideProperty={hideProperty}
      />
    );
  }

  const addr = payment.property?.address ?? "—";
  const canParts =
    !!addPartAction && !!updatePartAction && !!deletePartAction && supportsParts(payment);

  return (
    <>
    <tr className={cx("border-t border-black/[0.05] transition hover:bg-primary/[0.04]", zebra && "bg-black/[0.015]")}>
      {!hideProperty && (
        <td className="px-5 py-3.5">
          {payment.property ? (
            <Link
              href={`/propriedades/${payment.property.id}`}
              className="font-semibold text-ink hover:text-primary"
            >
              {addr}
            </Link>
          ) : (
            <span className="font-semibold text-ink/60">{addr}</span>
          )}
          {payment.property?.address2 && (
            <span className="block text-xs text-ink/45">{payment.property.address2}</span>
          )}
        </td>
      )}
      {!hideProperty && (
        <td className="px-5 py-3.5 text-ink/65">
          {payment.tenant ? (
            <Link href={`/clientes/${payment.tenant.id}`} className="hover:text-primary">
              {payment.tenant.name}
            </Link>
          ) : (
            "—"
          )}
        </td>
      )}
      <td className="px-5 py-3.5">
        <Badge tone={kindTone(payment.kind)}>{PAYMENT_KIND_LABEL[payment.kind]}</Badge>
        {payment.kind === "security_deposit" && payment.installment_total && (
          <span className="ml-2 text-xs font-semibold text-ink/45">
            Installment {payment.installment_no ?? "?"}/{payment.installment_total}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-5 py-3.5 text-ink/65">{date(payment.month)}</td>
      <td className="whitespace-nowrap px-5 py-3.5 text-ink/65">{date(payment.due_date)}</td>
      <td className="whitespace-nowrap px-5 py-3.5 text-ink/85">{money(payment.rent_amount)}</td>
      <td className="whitespace-nowrap px-5 py-3.5 text-ink/70">
        <div className="flex flex-col items-start gap-1.5">
          <span>{money(payment.commission)}</span>
          {payment.commission != null && payment.commission > 0 && (
            canManage && setCommissionPaid ? (
              <CommissionPaidToggle payment={payment} setCommissionPaid={setCommissionPaid} />
            ) : payment.commission_paid ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                <CheckSquare className="h-3 w-3" /> Paid
              </span>
            ) : null
          )}
        </div>
      </td>
      <td className="px-5 py-3.5">
        <StatusBadge payment={payment} />
      </td>
      <td className="px-5 py-3.5">
        {(() => {
          // Only payment-level receipts here; per-installment ones live in the
          // expandable panel (they carry a payment_part_id).
          const top = (payment.attachments ?? []).filter((a) => !a.payment_part_id);
          return top.length > 0 ? (
            <PaymentReceipt attachment={top[0]} />
          ) : (
            <span className="text-ink/30">—</span>
          );
        })()}
      </td>
      {canManage && (
        <td className="px-5 py-3.5">
          <div className="flex items-center justify-end gap-2">
            {canParts && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-black/[0.10] bg-white px-2 py-1.5 text-xs font-semibold text-ink/70 transition hover:border-primary/40 hover:text-primary"
                aria-expanded={expanded}
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Payments
                {payment.parts && payment.parts.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                    {payment.parts.length}
                  </span>
                )}
              </button>
            )}
            <StatusToggle payment={payment} setStatus={setStatus} />
            <EditButton onClick={() => setEditing(true)} />
            <DeleteControl action={deleteAction} hidden={{ id: payment.id }} noun="payment" />
          </div>
        </td>
      )}
    </tr>
    {canParts && expanded && (
      <tr className="border-t border-black/[0.05] bg-black/[0.015]">
        <td colSpan={colSpan} className="px-5 py-4">
          <RentInstallmentsPanel
            payment={payment}
            canManage={canManage}
            addPartAction={addPartAction!}
            updatePartAction={updatePartAction!}
            deletePartAction={deletePartAction!}
          />
        </td>
      </tr>
    )}
    </>
  );
}

export function PaymentsTable({
  payments,
  properties,
  canManage,
  setStatus,
  updateAction,
  deleteAction,
}: {
  payments: Payment[];
  properties: PaymentPropertyOption[];
  canManage: boolean;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  updateAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
}) {
  const [status, setStatusFilter] = useState<StatusFilter>("");
  const [kind, setKindFilter] = useState<KindFilter>("");
  const [query, setQuery] = useState("");

  const statusChips: Array<{ value: StatusFilter; label: string }> = [
    { value: "", label: "All" },
    { value: "due", label: "Due" },
    { value: "received", label: "Received" },
  ];
  const kindChips: Array<{ value: KindFilter; label: string }> = [
    { value: "", label: "All kinds" },
    { value: "monthly", label: "Monthly" },
    { value: "last_month", label: "Last month" },
    { value: "security_deposit", label: "Security deposit" },
  ];

  const term = query.trim().toLowerCase();
  const filtered = payments.filter((p) => {
    if (status && p.status !== status) return false;
    if (kind && p.kind !== kind) return false;
    if (term) {
      const hay = `${p.property?.address ?? ""} ${p.property?.address2 ?? ""} ${p.tenant?.name ?? ""}`.toLowerCase();
      return term.split(/\s+/).every((w) => hay.includes(w));
    }
    return true;
  });

  // Address, Tenant, Kind, Month, Due, Amount, Commission, Status, Receipt (+ actions)
  const colSpan = canManage ? 10 : 9;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {statusChips.map((c) => {
          const active = status === c.value;
          return (
            <button
              key={c.value || "all-status"}
              onClick={() => setStatusFilter(c.value)}
              className={cx(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-black/10 bg-white text-ink/60 hover:text-ink hover:border-black/20"
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {kindChips.map((c) => {
          const active = kind === c.value;
          return (
            <button
              key={c.value || "all-kind"}
              onClick={() => setKindFilter(c.value)}
              className={cx(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
                active
                  ? "border-secondary/40 bg-secondary/10 text-secondary"
                  : "border-black/10 bg-white text-ink/60 hover:text-ink hover:border-black/20"
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by property or tenant…"
          className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-10 text-center text-sm text-ink/55 shadow-card">
          No payments match the current filter.
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
              {filtered.map((p, i) => (
                <PaymentRow
                  key={p.id}
                  payment={p}
                  properties={properties}
                  canManage={canManage}
                  zebra={i % 2 === 1}
                  colSpan={colSpan}
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
  );
}
