import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, NoAccess, Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { Wallet } from "lucide-react";
import type { Payment } from "@/lib/types";
import { PaymentsClient } from "./PaymentsClient";
import { PaymentAddForm, type PaymentPropertyOption } from "./PaymentAddForm";
import {
  addPaymentAction,
  addSecurityDepositAction,
  updatePaymentAction,
  deletePaymentAction,
  setPaymentStatusAction,
  updateDepositTotalAction,
  deleteDepositGroupAction,
  addPaymentPartAction,
  updatePaymentPartAction,
  deletePaymentPartAction,
  setCommissionPaidAction,
  setOwnerPaidAction,
  setOwnerPaymentMethodAction,
  setOwnerCheckNumberAction,
  addOwnerPayoutReceiptAction,
  deleteOwnerPayoutReceiptAction,
} from "./actions";

export const dynamic = "force-dynamic";

// Pagamentos não-arquivados + joins de propriedade e inquilino. Carrega aluguel
// (monthly / first_month / last_month) E security_deposit — a separação por aba é
// feita no cliente (PaymentsClient): Due/Monthly/Past só veem rent kinds; a aba
// Security deposit vê só security_deposit. Ordena por mês (mais recente primeiro,
// nulls por último) e depois por criação.
async function loadPayments() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("payments")
      .select(
        "id, property_id, tenant_id, kind, month, due_date, rent_amount, commission, commission_paid, commission_paid_at, owner_paid, owner_paid_at, owner_payment_method, owner_check_number, status, received_at, amount_paid, notes, installment_no, installment_total, installment_group, archived_at, created_at, property:property_id (id, address, address2, property_type, rent_collection, owner:owner_id (id, name)), tenant:tenant_id (id, name), attachments:payment_attachments (id, file_url, file_name, content_type, payment_part_id, category), parts:payment_parts (id, payment_id, amount, paid_at, method, notes, created_at, attachments:payment_attachments (id, file_url, file_name, content_type, payment_part_id, category))"
      )
      .is("archived_at", null)
      .in("kind", ["monthly", "first_month", "last_month", "security_deposit"])
      .order("month", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { ok: true as const, payments: (data ?? []) as unknown as Payment[] };
  } catch {
    return { ok: false as const, payments: [] as Payment[] };
  }
}

// Propriedades elegíveis pro picker do form: year-round + off-season, ativas,
// ordenadas por endereço. Passadas pro cliente (o tenant é resolvido no servidor).
async function loadEligibleProperties(): Promise<PaymentPropertyOption[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("properties")
      .select("id, address, address2, rent_price")
      .is("archived_at", null)
      .in("property_type", ["year_round_rental", "off_season_rental"])
      .order("address", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as PaymentPropertyOption[];
  } catch {
    return [];
  }
}

export default async function PaymentsPage() {
  const profile = await getProfile();
  const canManage = can(profile, "payments.annual") || can(profile, "financials.full");
  if (!canManage) {
    return (
      <>
        <PageHeader title="Payments" />
        <NoAccess />
      </>
    );
  }

  const [{ ok, payments }, properties] = await Promise.all([
    loadPayments(),
    loadEligibleProperties(),
  ]);

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Monthly rent on a cash basis. Mark a payment received the day the money lands."
      />

      {!ok && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06] text-sm text-ink/70">
          Database not connected. Check the environment variables{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </Card>
      )}

      {payments.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="No payments yet"
          message="Record a rent payment and tie it to a property. Tenant and amount fill in automatically."
          cta={
            <PaymentAddForm
              properties={properties}
              action={addPaymentAction}
              depositAction={addSecurityDepositAction}
            />
          }
        />
      ) : (
        <PaymentsClient
          payments={payments}
          properties={properties}
          canManage={canManage}
          addAction={addPaymentAction}
          depositAction={addSecurityDepositAction}
          setStatus={setPaymentStatusAction}
          updateAction={updatePaymentAction}
          deleteAction={deletePaymentAction}
          updateDepositTotalAction={updateDepositTotalAction}
          deleteDepositGroupAction={deleteDepositGroupAction}
          addPartAction={addPaymentPartAction}
          updatePartAction={updatePaymentPartAction}
          deletePartAction={deletePaymentPartAction}
          setCommissionPaid={setCommissionPaidAction}
          ownerActions={{
            setOwnerPaid: setOwnerPaidAction,
            setOwnerMethod: setOwnerPaymentMethodAction,
            setOwnerCheckNumber: setOwnerCheckNumberAction,
            addReceipt: addOwnerPayoutReceiptAction,
            deleteReceipt: deleteOwnerPayoutReceiptAction,
          }}
        />
      )}
    </>
  );
}
