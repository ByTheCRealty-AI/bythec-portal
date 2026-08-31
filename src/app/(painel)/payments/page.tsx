import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, NoAccess, Card, buttonClass } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can, canDelete } from "@/lib/auth/capabilities";
import { Wallet, ShieldAlert } from "lucide-react";
import Link from "next/link";
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
  setCommissionPaidDateAction,
  setOwnerPaidAction,
  setOwnerPaymentMethodAction,
  setOwnerCheckNumberAction,
  setOwnerPaidDateAction,
  addOwnerPayoutReceiptAction,
  deleteOwnerPayoutReceiptAction,
  markDepositReceivedAction,
  setDepositReceivedDateAction,
  addDepositReceiptAction,
  deleteDepositReceiptAction,
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
      // Flags, não property_type derivado: uma casa "anual + à venda" deriva pra
      // for_sale e sumiria do picker de pagamento (0042).
      .or("is_year_round.eq.true,is_winter.eq.true")
      .order("address", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as PaymentPropertyOption[];
  } catch {
    return [];
  }
}

// Quantos recibos ainda moram no CDN do Bubble (file_url começa com http).
async function countOffsiteReceipts(): Promise<number> {
  try {
    const supabase = createClient();
    const { count } = await supabase
      .from("payment_attachments")
      .select("id", { count: "exact", head: true })
      .like("file_url", "http%");
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function PaymentsPage() {
  const profile = await getProfile();
  const canManage = can(profile, "payments.annual") || can(profile, "financials.full");
  const isOwner = canDelete(profile); // só o owner roda o resgate dos recibos
  if (!canManage) {
    return (
      <>
        <PageHeader title="Payments" />
        <NoAccess />
      </>
    );
  }

  const [{ ok, payments }, properties, offsiteReceipts] = await Promise.all([
    loadPayments(),
    loadEligibleProperties(),
    countOffsiteReceipts(),
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

      {/* Aviso só pro owner: recibos ainda hospedados no Bubble somem se ela
          cancelar a conta. Some sozinho quando chegar a zero. */}
      {isOwner && offsiteReceipts > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="font-semibold text-ink">
                  {offsiteReceipts} receipts are still stored on Bubble, not here
                </p>
                <p className="mt-0.5 text-ink/70">
                  The portal only keeps a link to them. If Bubble is cancelled, those images are
                  lost — the payments stay, the proof does not.
                </p>
              </div>
            </div>
            <Link href="/payments/receipts" className={buttonClass("primary")}>
              Bring them over
            </Link>
          </div>
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
          commissionActions={{
            setCommissionPaid: setCommissionPaidAction,
            setCommissionPaidDate: setCommissionPaidDateAction,
          }}
          ownerActions={{
            setOwnerPaid: setOwnerPaidAction,
            setOwnerMethod: setOwnerPaymentMethodAction,
            setOwnerCheckNumber: setOwnerCheckNumberAction,
            setOwnerPaidDate: setOwnerPaidDateAction,
            addReceipt: addOwnerPayoutReceiptAction,
            deleteReceipt: deleteOwnerPayoutReceiptAction,
          }}
          depositActions={{
            markReceived: markDepositReceivedAction,
            setReceivedDate: setDepositReceivedDateAction,
            addReceipt: addDepositReceiptAction,
            deleteReceipt: deleteDepositReceiptAction,
          }}
        />
      )}
    </>
  );
}
