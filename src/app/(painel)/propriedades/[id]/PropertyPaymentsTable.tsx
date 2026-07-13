"use client";

// Tabela de pagamentos NO CONTEXTO DE UMA PROPRIEDADE (aba Payments do detalhe).
// A propriedade é implícita: sem coluna Property/Tenant, sem busca por endereço.
// Reusa a PaymentRow da tela /payments em modo hideProperty (mesmo toggle de
// status em regime de caixa, edição inline e delete com confirmação).
import { PaymentRow } from "../../payments/PaymentsTable";
import type { OwnerPayoutActions } from "../../payments/OwnerPayoutControl";
import type { PaymentStatus, Payment } from "@/lib/types";

export function PropertyPaymentsTable({
  payments,
  canManage,
  setStatus,
  updateAction,
  deleteAction,
  addPartAction,
  updatePartAction,
  deletePartAction,
  ownerActions,
}: {
  payments: Payment[];
  canManage: boolean;
  setStatus: (id: string, status: PaymentStatus) => Promise<void>;
  updateAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
  addPartAction?: (fd: FormData) => void | Promise<void>;
  updatePartAction?: (fd: FormData) => void | Promise<void>;
  deletePartAction?: (fd: FormData) => void | Promise<void>;
  ownerActions?: OwnerPayoutActions;
}) {
  // Kind, Month, Due, Amount, Commission, Status, Receipt (+ actions). Sem Property/Tenant.
  const colSpan = canManage ? 8 : 7;

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
          <tr>
            <th className="px-5 py-3 font-bold">Kind</th>
            <th className="px-5 py-3 font-bold">Due</th>
            <th className="px-5 py-3 font-bold">Date received</th>
            <th className="px-5 py-3 font-bold">Amount</th>
            <th className="px-5 py-3 font-bold">Commission</th>
            <th className="px-5 py-3 font-bold">Status</th>
            <th className="px-5 py-3 font-bold">Receipt</th>
            {canManage && <th className="px-5 py-3" />}
          </tr>
        </thead>
        <tbody>
          {payments.map((p, i) => (
            <PaymentRow
              key={p.id}
              payment={p}
              properties={[]}
              canManage={canManage}
              zebra={i % 2 === 1}
              colSpan={colSpan}
              setStatus={setStatus}
              updateAction={updateAction}
              deleteAction={deleteAction}
              addPartAction={addPartAction}
              updatePartAction={updatePartAction}
              deletePartAction={deletePartAction}
              ownerActions={ownerActions}
              hideProperty
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
