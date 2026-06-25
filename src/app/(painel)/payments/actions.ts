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
  if (k === "first_month" || k === "last_month" || k === "security_deposit") return k;
  return "monthly";
}

// Primeiro dia do mês (YYYY-MM-01) a partir de um YYYY-MM-DD. Usa as partes da
// string direto pra não escorregar fuso. Null/invalid → null.
function firstOfMonth(ymd: string | null): string | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return null;
  return `${ymd.slice(0, 7)}-01`;
}

// Soma `monthsToAdd` meses a um YYYY-MM-DD mantendo o dia (clamped ao último dia
// do mês de destino). Pura aritmética de calendário em UTC pra ser determinística
// e livre de fuso. Null/invalid → null.
function addMonths(ymd: string | null, monthsToAdd: number): string | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return null;
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  const baseMonth0 = (m - 1) + monthsToAdd;
  const targetYear = y + Math.floor(baseMonth0 / 12);
  const targetMonth0 = ((baseMonth0 % 12) + 12) % 12;
  // Último dia do mês de destino (dia 0 do mês seguinte).
  const lastDay = new Date(Date.UTC(targetYear, targetMonth0 + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const mm = String(targetMonth0 + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${targetYear}-${mm}-${dd}`;
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

  // Insere o pagamento e recupera o id (necessário pra anexar o recibo, se houver).
  const { data: created, error } = await supabase
    .from("payments")
    .insert({
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
    })
    .select("id")
    .single();
  // Se o pagamento falha, não há linha nem órfão de arquivo — apenas aborta.
  if (error) throw new Error(error.message);

  // Recibo (opcional): o arquivo já foi subido client-side pro bucket privado
  // `documents`; aqui só persistimos a referência. Falha aqui NÃO derruba o
  // pagamento — soft error: o pagamento fica, e a falha é sinalizada.
  const receiptUrl = str(fd, "receipt_file_url");
  let softError: string | null = null;
  if (receiptUrl && created?.id) {
    const { error: attErr } = await supabase.from("payment_attachments").insert({
      payment_id: created.id,
      file_url: receiptUrl,
      file_name: str(fd, "receipt_file_name"),
      content_type: str(fd, "receipt_content_type"),
    });
    if (attErr) {
      softError = `Payment saved, but the receipt could not be attached: ${attErr.message}`;
    }
  }

  revalidatePath("/payments");
  revalidatePath("/propriedades/" + propertyId);
  if (softError) throw new Error(softError);
}

// Cria um SECURITY DEPOSIT dividido em N parcelas mensais. Mesmo gate dos demais.
// O total é repartido em DÓLARES INTEIROS, com o resto distribuído nas parcelas
// MAIS CEDO (ex.: $2.300/3 → 767, 767, 766). Todas as parcelas compartilham um
// `installment_group` (UUID), e cada uma carrega installment_no/total. Regime de
// caixa preservado: nascem 'due' (nada de received_at). O tenant é resolvido no
// servidor a partir da propriedade — nunca confiado do cliente.
export async function addSecurityDepositAction(fd: FormData) {
  await assertCanManagePayments();
  const supabase = createClient();

  const propertyId = str(fd, "property_id");
  if (!propertyId) throw new Error("A property is required to record a deposit.");

  const total = num(fd, "deposit_total");
  if (total === null || total <= 0) {
    throw new Error("Enter a total deposit amount greater than zero.");
  }

  // Número de parcelas: 1..24, default 3. Inteiro positivo.
  const rawN = num(fd, "installment_total");
  const n = rawN === null ? 3 : Math.floor(rawN);
  if (!Number.isFinite(n) || n < 1 || n > 24) {
    throw new Error("Number of installments must be between 1 and 24.");
  }

  const firstDue = str(fd, "first_due_date");
  if (!firstDue || !/^\d{4}-\d{2}-\d{2}/.test(firstDue)) {
    throw new Error("A valid first due date is required.");
  }

  // Inquilino atual da propriedade (server-side; não confiar no cliente).
  const { data: prop, error: propErr } = await supabase
    .from("properties")
    .select("id, tenant_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (propErr) throw new Error(propErr.message);
  if (!prop) throw new Error("That property could not be found.");
  const tenantId = (prop as { tenant_id: string | null }).tenant_id;

  // Split em dólares inteiros: o resto vai nas parcelas mais cedo.
  // base = floor(total/n); rem = total - base*n; amount(i) = base + (i<=rem ? 1 : 0)
  const totalWhole = Math.round(total); // dólares inteiros (sem centavos)
  const base = Math.floor(totalWhole / n);
  const rem = totalWhole - base * n; // 0..n-1

  const group = crypto.randomUUID();
  const rows = Array.from({ length: n }, (_, idx) => {
    const i = idx + 1; // 1-based
    const amount = base + (i <= rem ? 1 : 0);
    const dueDate = addMonths(firstDue, idx);
    return {
      property_id: propertyId,
      tenant_id: tenantId,
      kind: "security_deposit" as const,
      month: firstOfMonth(dueDate),
      due_date: dueDate,
      rent_amount: amount,
      commission: null,
      status: "due" as const,
      received_at: null,
      installment_no: i,
      installment_total: n,
      installment_group: group,
      notes: str(fd, "notes"),
    };
  });

  const { error } = await supabase.from("payments").insert(rows);
  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  revalidatePath("/propriedades/" + propertyId);
}

// Re-divide o TOTAL de um security deposit já existente entre as parcelas que ele
// já tem (mesmo número de parcelas, mesmas datas, mesmo grupo, mesmos status). Usado
// quando o total foi digitado errado na criação. Mesmo split em dólares inteiros do
// add (resto vai nas parcelas mais cedo). Aceita grupo (`installment_group`) OU uma
// linha legada única (`id`). NÃO mexe em received_at/status/datas — só nos valores.
export async function updateDepositTotalAction(fd: FormData) {
  await assertCanManagePayments();
  const supabase = createClient();

  const group = str(fd, "installment_group");
  const singleId = str(fd, "id");
  if (!group && !singleId) throw new Error("Missing deposit reference.");

  const total = num(fd, "deposit_total");
  if (total === null || total <= 0) {
    throw new Error("Enter a total deposit amount greater than zero.");
  }

  // Linhas do depósito (grupo inteiro, ou a linha legada única).
  const base$ = supabase
    .from("payments")
    .select("id, property_id, installment_no")
    .eq("kind", "security_deposit");
  const { data: rows, error: fetchErr } = group
    ? await base$.eq("installment_group", group)
    : await base$.eq("id", singleId as string);
  if (fetchErr) throw new Error(fetchErr.message);
  if (!rows || rows.length === 0) throw new Error("That deposit could not be found.");

  // Ordena por installment_no (nulls no fim) e re-divide em dólares inteiros: o
  // resto vai nas parcelas mais cedo — idêntico ao add.
  const ordered = [...rows].sort(
    (a, b) =>
      ((a as { installment_no: number | null }).installment_no ?? 0) -
      ((b as { installment_no: number | null }).installment_no ?? 0)
  );
  const n = ordered.length;
  const totalWhole = Math.round(total);
  const base = Math.floor(totalWhole / n);
  const rem = totalWhole - base * n; // 0..n-1 → primeiras `rem` parcelas levam +1

  for (let i = 0; i < n; i++) {
    const amount = base + (i < rem ? 1 : 0);
    const { error } = await supabase
      .from("payments")
      .update({ rent_amount: amount })
      .eq("id", (ordered[i] as { id: string }).id);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/payments");
  const propertyId = (ordered[0] as { property_id: string | null }).property_id;
  if (propertyId) revalidatePath("/propriedades/" + propertyId);
}

// HARD DELETE de um security deposit inteiro: todas as parcelas do grupo (ou a
// linha legada única). Os recibos anexados caem por ON DELETE CASCADE em
// payment_attachments. Gate re-checado; confirmação leve é na UI.
export async function deleteDepositGroupAction(fd: FormData) {
  await assertCanManagePayments();
  const supabase = createClient();

  const group = str(fd, "installment_group");
  const singleId = str(fd, "id");
  if (!group && !singleId) throw new Error("Missing deposit reference.");

  // property_id (de qualquer parcela) ANTES de deletar, pra revalidar a aba da casa.
  const probe = supabase
    .from("payments")
    .select("property_id")
    .eq("kind", "security_deposit");
  const { data: existing } = group
    ? await probe.eq("installment_group", group).limit(1).maybeSingle()
    : await probe.eq("id", singleId as string).maybeSingle();

  const del = supabase.from("payments").delete().eq("kind", "security_deposit");
  const { error } = group
    ? await del.eq("installment_group", group)
    : await del.eq("id", singleId as string);
  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  const propertyId = (existing as { property_id: string | null } | null)?.property_id;
  if (propertyId) revalidatePath("/propriedades/" + propertyId);
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
  revalidatePath("/propriedades/" + propertyId);
}

// Toggle rápido de status por linha. Carimba received_at ao receber; limpa ao
// voltar pra due (regime de caixa: a entrada só conta quando received).
export async function setPaymentStatusAction(id: string, status: PaymentStatus) {
  await assertCanManagePayments();
  if (!id) throw new Error("Missing payment reference.");
  const supabase = createClient();

  // Busca o property_id pra revalidar também a aba da propriedade.
  const { data: existing } = await supabase
    .from("payments")
    .select("property_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("payments")
    .update({
      status,
      received_at: status === "received" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/payments");
  const propertyId = (existing as { property_id: string | null } | null)?.property_id;
  if (propertyId) revalidatePath("/propriedades/" + propertyId);
}

// HARD DELETE de um pagamento. Gate re-checado. Confirmação leve é na UI.
export async function deletePaymentAction(fd: FormData) {
  await assertCanManagePayments();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing payment reference.");
  const supabase = createClient();

  // Busca o property_id ANTES de deletar pra revalidar a aba da propriedade.
  const { data: existing } = await supabase
    .from("payments")
    .select("property_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("payments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/payments");
  const propertyId = (existing as { property_id: string | null } | null)?.property_id;
  if (propertyId) revalidatePath("/propriedades/" + propertyId);
}
