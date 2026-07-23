"use client";

// =============================================================================
// TenantReassignControl — move UM pagamento pra outro inquilino, direto da janela
// do pagamento (property Payments tab). Pra lease takeover: uma mensal que nasceu
// no inquilino antigo passa pro novo. Dropdown com os inquilinos da propriedade
// (atual + passados). Importa a server action direto (mesmo padrão do
// ReceivedDateEditor) — só precisa receber a lista de inquilinos.
// =============================================================================

import { useState, useTransition } from "react";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { reassignPaymentTenantAction } from "./actions";
import type { Payment } from "@/lib/types";

export type TenantOption = { id: string; name: string };

export function TenantReassignControl({
  payment,
  tenants,
  canManage,
}: {
  payment: Payment;
  tenants: TenantOption[];
  canManage: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<string>(payment.tenant_id ?? "");

  // Garante que o inquilino atual da linha apareça na lista, mesmo se não veio.
  const options = [...tenants];
  if (payment.tenant_id && !options.some((t) => t.id === payment.tenant_id)) {
    options.unshift({ id: payment.tenant_id, name: payment.tenant?.name ?? "Current tenant" });
  }

  function move(next: string) {
    setValue(next);
    if (!next || next === (payment.tenant_id ?? "")) return;
    setError(null);
    start(async () => {
      try {
        await reassignPaymentTenantAction(payment.id, next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not move. Try again.");
        setValue(payment.tenant_id ?? "");
      }
    });
  }

  const inputClass =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15 disabled:opacity-60";

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-ink">
        <ArrowRightLeft className="mr-1 inline h-4 w-4 text-ink/50" /> Belongs to tenant
      </p>
      <p className="mb-2 text-xs text-ink/55">
        Move this payment to another tenant — for a lease takeover.
      </p>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => move(e.target.value)}
          disabled={!canManage || pending}
          className={inputClass}
        >
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {pending && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink/40" />}
      </div>
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
