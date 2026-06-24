"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import type { PaymentKind, PaymentStatus } from "@/lib/types";

// --- helpers (mesmo padrão de propriedades/actions.ts) ----------------------
function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}
function num(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Gate compartilhado: payments.annual OU financials.full. Re-checado no servidor
// (defesa em profundidade — o RLS reforça de verdade no banco).
async function assertCanManagePayments() {
  const profile = await getProfile();
  if (!can(profile, "payments.annual") && !can(profile, "financials.full")) {
    throw new Error("You do not have permission to manage payments.");
  }
}

// Normaliza kind do form pro enum travado. Default 'monthly'.
function kindOf(fd: FormData): PaymentKind {
  const k = str(fd, "kind");
  if (k === "last_month" || k === "security_deposit") return k;
  return "monthly";
}

// Normaliza status do form. Default 'due'.
function statusOf(fd: FormData): PaymentStatus {
  return str(fd, "status") === "received" ? "received" : "due";
}

// Cria um pagamento preso a uma propriedade. O tenant_id NÃO é confiado do
// cliente: buscamos o inquilino atual da propriedade no servidor. Regime de
// caixa: se status='received', carimba received_at = now().
export async function addPaymentAction(fd: FormData) {
  await assertCanManagePayments();
  const supabase = createClient();

  const propertyId = str(fd, "property_id");
  if (!propertyId) throw new Error("A property is required to record a payment.");

  // Inquilino atual da propriedade (server-side; não confiar em campo do cliente).
  const { data: prop, error: propErr } = await supabase
    .from("properties")
    .select("id, tenant_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (propErr) throw new Error(propErr.message);
  if (!prop) throw new Error("That property could not be found.");

  const status = statusOf(fd);

  const { error } = await supabase.from("payments").insert({
    property_id: propertyId,
    tenant_id: (prop as { tenant_id: string | null }).tenant_id, // auto, do servidor
    kind: kindOf(fd),
    month: str(fd, "month"),
    due_date: str(fd, "due_date"),
    rent_amount: num(fd, "rent_amount") ?? 0,
    commission: num(fd, "commission"),
    status,
    received_at: status === "received" ? new Date().toISOString() : null,
    notes: str(fd, "notes"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/payments");
}

// Edição inline de um pagamento (espelha os campos da add). property_id não muda;
// o tenant é re-derivado da propriedade no servidor. received_at acompanha o
// status: vira now() ao receber, null ao voltar pra due.
export async function updatePaymentAction(fd: FormData) {
  await assertCanManagePayments();
  const supabase = createClient();

  const id = str(fd, "id");
  if (!id) throw new Error("Missing payment reference.");
  const propertyId = str(fd, "property_id");
  if (!propertyId) throw new Error("A property is required.");

  const { data: prop, error: propErr } = await supabase
    .from("properties")
    .select("id, tenant_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (propErr) throw new Error(propErr.message);
  if (!prop) throw new Error("That property could not be found.");

  const status = statusOf(fd);

  const { error } = await supabase
    .from("payments")
    .update({
      property_id: propertyId,
      tenant_id: (prop as { tenant_id: string | null }).tenant_id,
      kind: kindOf(fd),
      month: str(fd, "month"),
      due_date: str(fd, "due_date"),
      rent_amount: num(fd, "rent_amount") ?? 0,
      commission: num(fd, "commission"),
      status,
      received_at: status === "received" ? new Date().toISOString() : null,
      notes: str(fd, "notes"),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/payments");
}

// Toggle rápido de status por linha. Carimba received_at ao receber; limpa ao
// voltar pra due (regime de caixa: a entrada só conta quando received).
export async function setPaymentStatusAction(id: string, status: PaymentStatus) {
  await assertCanManagePayments();
  if (!id) throw new Error("Missing payment reference.");
  const supabase = createClient();
  const { error } = await supabase
    .from("payments")
    .update({
      status,
      received_at: status === "received" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/payments");
}

// HARD DELETE de um pagamento. Gate re-checado. Confirmação leve é na UI.
export async function deletePaymentAction(fd: FormData) {
  await assertCanManagePayments();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing payment reference.");
  const supabase = createClient();
  const { error } = await supabase.from("payments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/payments");
}
