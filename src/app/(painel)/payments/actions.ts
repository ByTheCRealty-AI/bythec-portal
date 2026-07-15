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
      // One-shot add: if it's already received, the full rent is paid; else 0.
      amount_paid: status === "received" ? (num(fd, "rent_amount") ?? 0) : 0,
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

// Gera os pagamentos MENSAIS de um aluguel a partir das datas do contrato
// (rental_start → rental_end). Um row 'monthly' por mês, status 'due',
// comissão year-round = 10% do rent (regra TRAVADA). Idempotente: pula os meses
// que já têm um pagamento 'monthly' (clicar de novo não duplica). NÃO cria
// first/last month nem security deposit — esses são lançados à parte.
// Retorna quantos foram criados e quantos foram pulados (pra feedback na UI).
export async function generateMonthlyPaymentsAction(
  propertyId: string
): Promise<{ created: number; skipped: number }> {
  await assertCanManagePayments();
  if (!propertyId) throw new Error("A property is required.");
  const supabase = createClient();

  const { data: prop, error: propErr } = await supabase
    .from("properties")
    .select("id, tenant_id, rent_price, rental_start, rental_end, rent_due_day")
    .eq("id", propertyId)
    .maybeSingle();
  if (propErr) throw new Error(propErr.message);
  if (!prop) throw new Error("That property could not be found.");

  const p = prop as {
    tenant_id: string | null;
    rent_price: number | string | null;
    rental_start: string | null;
    rental_end: string | null;
    rent_due_day: number | null;
  };

  const rent = Number(p.rent_price);
  if (!p.rental_start || !p.rental_end) {
    throw new Error("Set the lease start and end dates on this property first.");
  }
  if (!Number.isFinite(rent) || rent <= 0) {
    throw new Error("Set the monthly rent on this property first.");
  }

  const [sy, sm] = p.rental_start.slice(0, 10).split("-").map(Number);
  const [ey, em] = p.rental_end.slice(0, 10).split("-").map(Number);
  const monthCount = (ey - sy) * 12 + (em - sm) + 1;
  if (monthCount < 1 || monthCount > 120) {
    throw new Error("The lease dates look off — check the start and end dates.");
  }

  const dueDay = p.rent_due_day ?? 1;
  const commission = Math.round(rent * 0.1 * 100) / 100;

  // Meses que já têm um pagamento mensal — pra pular (idempotência).
  const { data: existing, error: exErr } = await supabase
    .from("payments")
    .select("month")
    .eq("property_id", propertyId)
    .eq("kind", "monthly");
  if (exErr) throw new Error(exErr.message);
  const taken = new Set(
    (existing ?? [])
      .map((r) => firstOfMonth((r as { month: string | null }).month))
      .filter((m): m is string => Boolean(m))
  );

  // Base com o dia de vencimento; addMonths mantém o dia (clamped ao fim do mês).
  const dueBase = `${String(sy).padStart(4, "0")}-${String(sm).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;

  const rows: Array<Record<string, unknown>> = [];
  let skipped = 0;
  for (let i = 0; i < monthCount; i++) {
    const dueDate = addMonths(dueBase, i);
    const month = firstOfMonth(dueDate);
    if (!month || !dueDate) continue;
    if (taken.has(month)) {
      skipped++;
      continue;
    }
    rows.push({
      property_id: propertyId,
      tenant_id: p.tenant_id,
      kind: "monthly",
      month,
      due_date: dueDate,
      rent_amount: rent,
      commission,
      status: "due",
      amount_paid: 0,
    });
  }

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("payments").insert(rows);
    if (insErr) throw new Error(insErr.message);
  }

  revalidatePath("/payments");
  revalidatePath("/propriedades/" + propertyId);
  return { created: rows.length, skipped };
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
// voltar pra due (regime de caixa: a entrada só conta quando received). Mantém
// amount_paid coerente pro display de progresso: received => rent cheio, due => 0.
export async function setPaymentStatusAction(id: string, status: PaymentStatus) {
  await assertCanManagePayments();
  if (!id) throw new Error("Missing payment reference.");
  const supabase = createClient();

  // Busca property_id (revalidar a aba da propriedade) + rent_amount (amount_paid).
  const { data: existing } = await supabase
    .from("payments")
    .select("property_id, rent_amount")
    .eq("id", id)
    .maybeSingle();
  const rent = Number((existing as { rent_amount: number | null } | null)?.rent_amount ?? 0);

  const { error } = await supabase
    .from("payments")
    .update({
      status,
      received_at: status === "received" ? new Date().toISOString() : null,
      amount_paid: status === "received" ? rent : 0,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/payments");
  const propertyId = (existing as { property_id: string | null } | null)?.property_id;
  if (propertyId) revalidatePath("/propriedades/" + propertyId);
}

// --- PAGAMENTOS PARCIAIS (payment_parts) ------------------------------------
// Um aluguel (monthly / first_month / last_month) pode ser quitado em N parcelas.
// Cada parcela tem valor + data + método + comprovantes próprios (qualquer mídia,
// inclusive o recibo de papel do cash). O pai só vira 'received' quando a soma
// fecha o rent_amount (regra de caixa: comissão só conta no received).

type ReceiptRef = { url: string; name: string | null; type: string | null };

// Recibos chegam num JSON (já subidos pro bucket client-side): [{url,name,type}].
function parseReceipts(fd: FormData): ReceiptRef[] {
  const raw = str(fd, "receipts_json");
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.url === "string" && x.url.length > 0)
      .map((x) => ({
        url: x.url as string,
        name: typeof x.name === "string" ? x.name : null,
        type: typeof x.type === "string" ? x.type : null,
      }));
  } catch {
    return [];
  }
}

// Recalcula amount_paid + status + received_at a partir das parcelas vivas.
// Fonte única da verdade — chamado após qualquer add/edit/delete de parcela.
async function recomputePaymentFromParts(
  supabase: ReturnType<typeof createClient>,
  paymentId: string
) {
  const { data: payment, error: pErr } = await supabase
    .from("payments")
    .select("rent_amount")
    .eq("id", paymentId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!payment) throw new Error("That payment could not be found.");

  const { data: parts, error: partsErr } = await supabase
    .from("payment_parts")
    .select("amount, paid_at")
    .eq("payment_id", paymentId)
    .is("archived_at", null);
  if (partsErr) throw new Error(partsErr.message);

  const rent = Number((payment as { rent_amount: number | null }).rent_amount ?? 0);
  const rows = (parts ?? []) as { amount: number | null; paid_at: string | null }[];
  const paid = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  let status: PaymentStatus = "due";
  let received_at: string | null = null;
  if (rent > 0 && paid >= rent) {
    status = "received";
    // Carimba a data da última parcela (regra de caixa). Meio-dia UTC evita
    // que o fuso jogue a data pro dia anterior em America/New_York.
    const maxPaid = rows
      .map((r) => r.paid_at)
      .filter((d): d is string => !!d)
      .sort()
      .pop();
    received_at = maxPaid
      ? new Date(`${maxPaid}T12:00:00Z`).toISOString()
      : new Date().toISOString();
  }

  const { error: upErr } = await supabase
    .from("payments")
    .update({ amount_paid: paid, status, received_at })
    .eq("id", paymentId);
  if (upErr) throw new Error(upErr.message);
}

function revalidatePayment(propertyId: string | null) {
  revalidatePath("/payments");
  if (propertyId) revalidatePath("/propriedades/" + propertyId);
}

// Registra UMA parcela paga contra um aluguel + recibos opcionais.
export async function addPaymentPartAction(fd: FormData) {
  await assertCanManagePayments();
  const supabase = createClient();

  const paymentId = str(fd, "payment_id");
  if (!paymentId) throw new Error("Missing payment reference.");
  const amount = num(fd, "amount");
  if (amount === null || amount <= 0) {
    throw new Error("Enter a payment amount greater than zero.");
  }
  const paidAt = str(fd, "paid_at");
  if (!paidAt || !/^\d{4}-\d{2}-\d{2}/.test(paidAt)) {
    throw new Error("A valid payment date is required.");
  }

  const { data: part, error } = await supabase
    .from("payment_parts")
    .insert({
      payment_id: paymentId,
      amount,
      paid_at: paidAt,
      method: str(fd, "method"),
      notes: str(fd, "notes"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Recibos: gravamos payment_id (o RLS exige) E payment_part_id (liga à parcela).
  const receipts = parseReceipts(fd);
  if (receipts.length && part?.id) {
    const partId = (part as { id: string }).id;
    const rows = receipts.map((r) => ({
      payment_id: paymentId,
      payment_part_id: partId,
      file_url: r.url,
      file_name: r.name,
      content_type: r.type,
    }));
    const { error: attErr } = await supabase.from("payment_attachments").insert(rows);
    if (attErr) {
      // Soft: a parcela fica; sinaliza a falha do recibo (não derruba o pagamento).
      await recomputePaymentFromParts(supabase, paymentId);
      revalidatePayment(str(fd, "property_id"));
      throw new Error(`Payment saved, but a receipt could not be attached: ${attErr.message}`);
    }
  }

  await recomputePaymentFromParts(supabase, paymentId);
  revalidatePayment(str(fd, "property_id"));
}

// Edita o valor/data/método/notas de uma parcela (recibos via add/delete).
export async function updatePaymentPartAction(fd: FormData) {
  await assertCanManagePayments();
  const supabase = createClient();

  const id = str(fd, "id");
  const paymentId = str(fd, "payment_id");
  if (!id || !paymentId) throw new Error("Missing payment reference.");
  const amount = num(fd, "amount");
  if (amount === null || amount <= 0) {
    throw new Error("Enter a payment amount greater than zero.");
  }
  const paidAt = str(fd, "paid_at");
  if (!paidAt || !/^\d{4}-\d{2}-\d{2}/.test(paidAt)) {
    throw new Error("A valid payment date is required.");
  }

  const { error } = await supabase
    .from("payment_parts")
    .update({
      amount,
      paid_at: paidAt,
      method: str(fd, "method"),
      notes: str(fd, "notes"),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Permite anexar mais recibos na edição também.
  const receipts = parseReceipts(fd);
  if (receipts.length) {
    const rows = receipts.map((r) => ({
      payment_id: paymentId,
      payment_part_id: id,
      file_url: r.url,
      file_name: r.name,
      content_type: r.type,
    }));
    const { error: attErr } = await supabase.from("payment_attachments").insert(rows);
    if (attErr) throw new Error(`Saved, but a receipt could not be attached: ${attErr.message}`);
  }

  await recomputePaymentFromParts(supabase, paymentId);
  revalidatePayment(str(fd, "property_id"));
}

// Deleta uma parcela (os recibos dela caem por ON DELETE CASCADE) e recalcula.
export async function deletePaymentPartAction(fd: FormData) {
  await assertCanManagePayments();
  const supabase = createClient();

  const id = str(fd, "id");
  const paymentId = str(fd, "payment_id");
  if (!id || !paymentId) throw new Error("Missing payment reference.");

  const { error } = await supabase.from("payment_parts").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recomputePaymentFromParts(supabase, paymentId);
  revalidatePayment(str(fd, "property_id"));
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

// Toggle manual: a comissão da By the C desse pagamento foi paga/liquidada.
// Carimba commission_paid_at ao marcar; limpa ao desmarcar. Mesmo gate dos demais.
export async function setCommissionPaidAction(id: string, paid: boolean) {
  await assertCanManagePayments();
  if (!id) throw new Error("Missing payment reference.");
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("payments")
    .select("property_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("payments")
    .update({
      commission_paid: paid,
      commission_paid_at: paid ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  const propertyId = (existing as { property_id: string | null } | null)?.property_id;
  if (propertyId) revalidatePath("/propriedades/" + propertyId);
}

// Edita a DATA em que a comissão foi coletada (a comissão já precisa estar
// marcada como paga). Recebe YYYY-MM-DD do <input type="date"> e normaliza pra
// meio-dia UTC — assim o dia não drifta ao voltar do banco (commission_paid_at é
// timestamptz) e é lido igual em qualquer fuso dos EUA. null limpa a data.
export async function setCommissionPaidDateAction(id: string, dateStr: string | null) {
  await assertCanManagePayments();
  if (!id) throw new Error("Missing payment reference.");
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("payments")
    .select("property_id, commission_paid")
    .eq("id", id)
    .maybeSingle();
  const row = existing as { property_id: string | null; commission_paid: boolean } | null;
  if (!row?.commission_paid) throw new Error("Mark the commission collected first, then set the date.");

  const at = dateStr ? `${dateStr}T12:00:00.000Z` : null;
  const { error } = await supabase.from("payments").update({ commission_paid_at: at }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  if (row.property_id) revalidatePath("/propriedades/" + row.property_id);
}

// --- OWNER PAYOUTS (rent_collection = 'bythec') -----------------------------
// Repasse ao owner de um aluguel RECEBIDO. Espelha o payout de invoice de
// temporada: toggle "paid" (carimba owner_paid_at), método, nº do eCheck, recibo
// (category='owner_payout'). Mesmo gate + revalidação das demais actions.

// Helper: property_id do pagamento (pra revalidar a aba da propriedade).
async function paymentPropertyId(
  supabase: ReturnType<typeof createClient>,
  id: string
): Promise<string | null> {
  const { data } = await supabase
    .from("payments")
    .select("property_id")
    .eq("id", id)
    .maybeSingle();
  return (data as { property_id: string | null } | null)?.property_id ?? null;
}

// Marca / desmarca o repasse ao owner. Carimba owner_paid_at ao marcar.
export async function setOwnerPaidAction(id: string, paid: boolean) {
  await assertCanManagePayments();
  if (!id) throw new Error("Missing payment reference.");
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("payments")
    .select("property_id, commission, commission_paid")
    .eq("id", id)
    .maybeSingle();
  const row = existing as
    | { property_id: string | null; commission: number | null; commission_paid: boolean }
    | null;
  const propertyId = row?.property_id ?? null;

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    owner_paid: paid,
    owner_paid_at: paid ? now : null,
  };

  // Regra do negócio (Andrea): quando By the C coleta o aluguel, a comissão é
  // coletada NO MOMENTO em que ela paga o owner — ela retém os 10% antes de
  // repassar. Então marcar "owner pago" auto-marca a comissão como coletada
  // nessa data. NÃO sobrescreve uma data de comissão já registrada (ela pode ter
  // editado). Desmarcar owner NÃO desfaz a comissão (evita perda silenciosa; a
  // Andrea edita/desmarca a comissão pela própria janela).
  if (paid && (row?.commission ?? 0) > 0 && !row?.commission_paid) {
    update.commission_paid = true;
    update.commission_paid_at = now;
  }

  const { error } = await supabase.from("payments").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  if (propertyId) revalidatePath("/propriedades/" + propertyId);
}

// Salva o método do repasse (eCheck | Zelle | Cash | Other). null limpa.
export async function setOwnerPaymentMethodAction(id: string, method: string | null) {
  await assertCanManagePayments();
  if (!id) throw new Error("Missing payment reference.");
  const supabase = createClient();
  const propertyId = await paymentPropertyId(supabase, id);

  const { error } = await supabase
    .from("payments")
    .update({ owner_payment_method: method })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  if (propertyId) revalidatePath("/propriedades/" + propertyId);
}

// Salva o nº do eCheck do repasse. null limpa.
export async function setOwnerCheckNumberAction(id: string, checkNumber: string | null) {
  await assertCanManagePayments();
  if (!id) throw new Error("Missing payment reference.");
  const supabase = createClient();
  const propertyId = await paymentPropertyId(supabase, id);

  const { error } = await supabase
    .from("payments")
    .update({ owner_check_number: checkNumber })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  if (propertyId) revalidatePath("/propriedades/" + propertyId);
}

// Anexa um recibo do REPASSE ao owner (category='owner_payout'). O arquivo já foi
// subido client-side pro bucket privado `documents`; aqui só a linha.
export async function addOwnerPayoutReceiptAction(fd: FormData) {
  await assertCanManagePayments();
  const supabase = createClient();

  const paymentId = str(fd, "payment_id");
  if (!paymentId) throw new Error("Missing payment reference.");
  const fileUrl = str(fd, "file_url");
  if (!fileUrl) throw new Error("Missing uploaded file reference.");

  const { error } = await supabase.from("payment_attachments").insert({
    payment_id: paymentId,
    file_url: fileUrl,
    file_name: str(fd, "file_name"),
    content_type: str(fd, "content_type"),
    category: "owner_payout",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  const propertyId = await paymentPropertyId(supabase, paymentId);
  if (propertyId) revalidatePath("/propriedades/" + propertyId);
}

// Remove um recibo de repasse: apaga o object do Storage e depois a linha.
export async function deleteOwnerPayoutReceiptAction(fd: FormData) {
  await assertCanManagePayments();
  const supabase = createClient();

  const id = str(fd, "id");
  if (!id) throw new Error("Missing receipt reference.");
  const paymentId = str(fd, "payment_id");
  const fileUrl = str(fd, "file_url");

  // Só remove do Storage se for um object path nosso (não URL externa legada).
  if (fileUrl && !/^https?:\/\//i.test(fileUrl)) {
    const { error: storageError } = await supabase.storage.from("documents").remove([fileUrl]);
    if (storageError) throw new Error(`Could not remove the file: ${storageError.message}`);
  }

  const { error } = await supabase
    .from("payment_attachments")
    .delete()
    .eq("id", id)
    .eq("category", "owner_payout");
  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  if (paymentId) {
    const propertyId = await paymentPropertyId(supabase, paymentId);
    if (propertyId) revalidatePath("/propriedades/" + propertyId);
  }
}

// --- SECURITY DEPOSITS: recibo obrigatório + data editável -------------------
// Uma parcela de depósito NÃO usa payment_parts. Marcar recebida EXIGE recibo
// (prova de entrada), grava a data em que caiu (editável) e anexa o comprovante
// (category='rent_receipt' — o CHECK só aceita rent_receipt|owner_payout, e o
// recibo do depósito é prova do inquilino). Regime de caixa: amount_paid cheio.

// YYYY-MM-DD -> meio-dia UTC (sem drift de dia no fuso). Sem data válida = hoje.
function depositReceivedAt(dateStr: string | null): string {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return `${dateStr}T12:00:00.000Z`;
  return new Date().toISOString();
}

// Marca a parcela de depósito como recebida. EXIGE ao menos um recibo (já subido
// client-side). Carimba received_at (data informada ou hoje) + amount_paid cheio.
export async function markDepositReceivedAction(fd: FormData) {
  await assertCanManagePayments();
  const supabase = createClient();

  const id = str(fd, "id");
  if (!id) throw new Error("Missing deposit reference.");
  const receipts = parseReceipts(fd);
  if (!receipts.length) throw new Error("Attach a receipt to mark this deposit received.");

  const { data: existing } = await supabase
    .from("payments")
    .select("property_id, rent_amount, kind")
    .eq("id", id)
    .maybeSingle();
  const row = existing as
    | { property_id: string | null; rent_amount: number | null; kind: string }
    | null;
  if (!row) throw new Error("That deposit could not be found.");
  if (row.kind !== "security_deposit") throw new Error("This is not a security deposit.");

  const { error } = await supabase
    .from("payments")
    .update({
      status: "received" as const,
      received_at: depositReceivedAt(str(fd, "received_at")),
      amount_paid: Number(row.rent_amount ?? 0),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // category default = 'rent_receipt' (o CHECK só aceita rent_receipt|owner_payout).
  // O recibo do depósito é prova do inquilino, então 'rent_receipt' encaixa.
  const rows = receipts.map((r) => ({
    payment_id: id,
    file_url: r.url,
    file_name: r.name,
    content_type: r.type,
    category: "rent_receipt",
  }));
  const { error: attErr } = await supabase.from("payment_attachments").insert(rows);
  if (attErr) throw new Error(`Deposit marked received, but the receipt could not be attached: ${attErr.message}`);

  revalidatePath("/payments");
  if (row.property_id) revalidatePath("/propriedades/" + row.property_id);
}

// Edita a data em que o depósito foi recebido (já recebido). YYYY-MM-DD.
export async function setDepositReceivedDateAction(id: string, dateStr: string | null) {
  await assertCanManagePayments();
  if (!id) throw new Error("Missing deposit reference.");
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error("Enter a valid date.");
  const supabase = createClient();

  const propertyId = await paymentPropertyId(supabase, id);
  const { error } = await supabase
    .from("payments")
    .update({ received_at: depositReceivedAt(dateStr) })
    .eq("id", id)
    .eq("kind", "security_deposit");
  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  if (propertyId) revalidatePath("/propriedades/" + propertyId);
}

// Anexa um recibo extra a um depósito (category='rent_receipt'). Arquivo já
// subido client-side. Espelha addOwnerPayoutReceiptAction.
export async function addDepositReceiptAction(fd: FormData) {
  await assertCanManagePayments();
  const supabase = createClient();

  const paymentId = str(fd, "payment_id");
  if (!paymentId) throw new Error("Missing deposit reference.");
  const fileUrl = str(fd, "file_url");
  if (!fileUrl) throw new Error("Missing uploaded file reference.");

  const { error } = await supabase.from("payment_attachments").insert({
    payment_id: paymentId,
    file_url: fileUrl,
    file_name: str(fd, "file_name"),
    content_type: str(fd, "content_type"),
    category: "rent_receipt",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  const propertyId = await paymentPropertyId(supabase, paymentId);
  if (propertyId) revalidatePath("/propriedades/" + propertyId);
}

// Remove um recibo de depósito: apaga o object do Storage e depois a linha.
export async function deleteDepositReceiptAction(fd: FormData) {
  await assertCanManagePayments();
  const supabase = createClient();

  const id = str(fd, "id");
  if (!id) throw new Error("Missing receipt reference.");
  const paymentId = str(fd, "payment_id");
  const fileUrl = str(fd, "file_url");

  if (fileUrl && !/^https?:\/\//i.test(fileUrl)) {
    const { error: storageError } = await supabase.storage.from("documents").remove([fileUrl]);
    if (storageError) throw new Error(`Could not remove the file: ${storageError.message}`);
  }

  const { error } = await supabase
    .from("payment_attachments")
    .delete()
    .eq("id", id)
    .eq("category", "rent_receipt");
  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  if (paymentId) {
    const propertyId = await paymentPropertyId(supabase, paymentId);
    if (propertyId) revalidatePath("/propriedades/" + propertyId);
  }
}
