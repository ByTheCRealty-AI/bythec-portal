"use client";

// Tabela de pagamentos (year-round / off-season) com filtros de status e kind,
// busca por endereço + inquilino, e ações por linha: toggle de status (regime de
// caixa), delete com confirmação leve, e edição inline. Mesmo visual das outras
// telas (zebra rows, chips, glass forms).
import { useState } from "react";
import { Search, Square, CheckSquare } from "lucide-react";
import { Badge } from "@/components/ui";
import { PaymentReceipt } from "./PaymentReceipt";
import { PaymentWindow } from "./PaymentEntryButton";
import { type OwnerPayoutActions } from "./OwnerPayoutControl";
import { type CommissionActions } from "./CommissionCollectedControl";
import { money, date, cx } from "@/lib/format";
import {
  PAYMENT_KIND_LABEL,
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

// Selo de status da comissão (SOMENTE LEITURA) pra célula da linha. Marcar/
// desmarcar e editar a data agora vivem na janela do pagamento
// (CommissionCollectedControl) — a linha só informa se já foi coletada ou não.
export function CommissionStatusBadge({ payment }: { payment: Payment }) {
  if (payment.commission == null || payment.commission <= 0) return null;
  // Owner-collects (arrangement B): a comissão VEM do owner → "received".
  const ownerRemits = payment.property?.rent_collection === "owner";
  if (payment.commission_paid) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
        <CheckSquare className="h-3 w-3" />
        {ownerRemits ? "Received" : "Collected"}
        {payment.commission_paid_at ? ` · ${date(payment.commission_paid_at)}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-black/[0.12] bg-black/[0.02] px-2 py-0.5 text-[11px] font-semibold text-ink/45">
      <Square className="h-3 w-3" /> Not {ownerRemits ? "received" : "collected"}
    </span>
  );
}

function kindTone(k: PaymentKind): "gold" | "orange" | "neutral" {
  if (k === "security_deposit") return "gold";
  if (k === "last_month") return "orange";
  return "neutral";
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
  commissionActions,
  ownerActions,
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
  // Commission actions (mark + editable date). When provided AND commission > 0,
  // the payment window shows the commission control. The row only shows a status
  // badge. Optional so read-only contexts skip it.
  commissionActions?: CommissionActions;
  // Owner-payout actions. When provided AND the property collects rent through
  // By the C AND the payment is received, the row gets an "Owner payout" toggle
  // that expands the payout control. Optional so read-only contexts skip it.
  ownerActions?: OwnerPayoutActions;
}) {
  const [payOpen, setPayOpen] = useState(false);

  // Tudo do pagamento — record, mark paid, edit, delete E owner payout — vive
  // DENTRO da janela (PaymentWindow) que abre no clique da linha. Sem botões na linha.

  const addr = payment.property?.address ?? "—";
  const canParts =
    !!addPartAction && !!updatePartAction && !!deletePartAction && supportsParts(payment);

  return (
    <>
    {/* Linha clicável (aluguel): clicar em qualquer parte NÃO-interativa abre a
        janela de Record payment. As células de Receipt e Ações têm stopPropagation. */}
    <tr
      className={cx(
        "border-t border-black/[0.05] transition hover:bg-primary/[0.04]",
        zebra && "bg-black/[0.015]",
        canParts && canManage && "cursor-pointer"
      )}
      onClick={canParts && canManage ? () => setPayOpen(true) : undefined}
    >
      {!hideProperty && (
        <td className="px-5 py-3.5">
          <span className={cx("font-semibold", payment.property ? "text-primary" : "text-ink/60")}>
            {addr}
          </span>
          {payment.property?.address2 && (
            <span className="block text-xs text-ink/45">{payment.property.address2}</span>
          )}
        </td>
      )}
      {!hideProperty && (
        <td className="px-5 py-3.5 text-ink/65">{payment.tenant?.name ?? "—"}</td>
      )}
      <td className="px-5 py-3.5">
        <Badge tone={kindTone(payment.kind)}>{PAYMENT_KIND_LABEL[payment.kind]}</Badge>
        {payment.kind === "security_deposit" && payment.installment_total && (
          <span className="ml-2 text-xs font-semibold text-ink/45">
            Installment {payment.installment_no ?? "?"}/{payment.installment_total}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-5 py-3.5 text-ink/65">{date(payment.due_date)}</td>
      <td className="whitespace-nowrap px-5 py-3.5 text-ink/65">
        {payment.received_at ? date(payment.received_at) : <span className="text-ink/30">—</span>}
      </td>
      <td className="whitespace-nowrap px-5 py-3.5 text-ink/85">{money(payment.rent_amount)}</td>
      <td className="whitespace-nowrap px-5 py-3.5 text-ink/70">
        <div className="flex flex-col items-start gap-1.5">
          <span>{money(payment.commission)}</span>
          <CommissionStatusBadge payment={payment} />
        </div>
      </td>
      <td className="px-5 py-3.5">
        <StatusBadge payment={payment} />
      </td>
      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
        {(() => {
          // ALL rent receipts for this payment: payment-level AND per-installment
          // (the query already loads both under payment.attachments). Owner-payout
          // receipts (category='owner_payout') are excluded — they live in the
          // Owner payout control, not the tenant Receipt column.
          const all = (payment.attachments ?? []).filter((a) => a.category !== "owner_payout");
          return all.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {all.map((a) => (
                <PaymentReceipt key={a.id} attachment={a} />
              ))}
            </div>
          ) : (
            <span className="text-ink/30">—</span>
          );
        })()}
      </td>
    </tr>
    {canParts && (
      <PaymentWindow
        open={payOpen}
        onClose={() => setPayOpen(false)}
        payment={payment}
        canManage={canManage}
        supportsParts={supportsParts(payment)}
        setStatus={setStatus}
        addPartAction={addPartAction!}
        updatePartAction={updatePartAction!}
        deletePartAction={deletePartAction!}
        properties={properties}
        updateAction={updateAction}
        deleteAction={deleteAction}
        hideProperty={hideProperty}
        ownerActions={ownerActions}
        commissionActions={commissionActions}
      />
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
                <th className="px-5 py-3 font-bold">Due</th>
                <th className="px-5 py-3 font-bold">Date received</th>
                <th className="px-5 py-3 font-bold">Amount</th>
                <th className="px-5 py-3 font-bold">Commission</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3 font-bold">Receipt</th>
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
