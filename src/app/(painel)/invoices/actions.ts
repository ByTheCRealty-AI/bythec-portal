"use server";

// =============================================================================
// By the C — Invoices · Server Actions
// =============================================================================
// Cria/edita invoices SERVICE e SEASONAL. A numeração é atribuída pelo TRIGGER
// do banco (migration 0008) — o app NUNCA escolhe o número (atômico, sem race).
//
// SEGURANÇA:
//  - Capacidade enforça aqui (defesa de app) E no RLS (defesa de banco):
//    service-only users (invoices.service) NÃO podem criar/editar SEASONAL.
//  - Totais seasonal são RECOMPUTADOS no servidor pela fórmula travada
//    (src/lib/invoice-formula.ts) — não confiamos nos números do cliente.
//  - Invoice NUNCA é deletado — arquivar (archived_at).
// =============================================================================

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { computeSeasonal, round2, serviceBilled } from "@/lib/invoice-formula";
import type { CleaningDestination, InvoiceItemCategory, SeasonalCommissionBase } from "@/lib/types";

// ---- Helpers de FormData ---------------------------------------------------
function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}
function num(fd: FormData, key: string): number {
  const s = str(fd, key);
  if (s === null) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function numOrNull(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Lê arrays de itens enviados como item_<i>_<campo>. Para até MAX itens.
const MAX_ITEMS = 50;

// ---- SERVICE invoice -------------------------------------------------------
export async function createServiceInvoice(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "financials.full") && !can(profile, "invoices.service")) {
    throw new Error("You do not have access to create invoices.");
  }

  const supabase = createClient();

  const items = readServiceItems(fd);
  const t = serviceTotals(items);

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      kind: "service",
      client_id: str(fd, "client_id"),
      property_id: str(fd, "property_id"),
      provider_id: str(fd, "provider_id"),
      service_address: str(fd, "service_address"),
      date: str(fd, "date"),
      work_date: str(fd, "work_date"),
      due_date: str(fd, "due_date"),
      notes: str(fd, "notes"),
      labor_total: t.labor_total,
      material_total: t.material_total,
      labor_cost: t.labor_cost,
      material_cost: t.material_cost,
      service_commission: t.commission,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  if (items.length > 0) {
    const { error: itemsErr } = await supabase.from("invoice_items").insert(
      items.map((it) => ({
        invoice_id: data.id,
        description: it.description,
        total: it.total,
        cost: it.cost,
        type: "charge",
        category: it.category,
        guest: false,
        owner: false,
      }))
    );
    if (itemsErr) throw new Error(itemsErr.message);
  }

  revalidatePath("/invoices");
  redirect(`/invoices/${data.id}`);
}

// ---- SERVICE helpers -------------------------------------------------------
// A Andrea digita o CUSTO do worker (item_<i>_amount). O preço ao owner tem os
// 10% da By the C EMBUTIDOS: total = round(cost*1.10,2). labor_total/material_total
// são o que o OWNER paga; labor_cost/material_cost são o custo do worker (interno).
type ServiceItem = {
  description: string;
  cost: number; // custo do worker
  total: number; // preço ao owner (comissão embutida)
  category: InvoiceItemCategory;
};

function readServiceItems(fd: FormData): ServiceItem[] {
  const items: ServiceItem[] = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const description = str(fd, `item_${i}_description`);
    const amountRaw = str(fd, `item_${i}_amount`);
    const category = (str(fd, `item_${i}_category`) as InvoiceItemCategory | null) ?? "labor";
    if (!description && !amountRaw) continue;
    const cost = round2(Number(amountRaw ?? 0) || 0);
    items.push({ description: description ?? "(no description)", cost, total: serviceBilled(cost), category });
  }
  return items;
}

function serviceTotals(items: ServiceItem[]) {
  const labor = items.filter((it) => it.category === "labor");
  const material = items.filter((it) => it.category === "material");
  const labor_total = round2(labor.reduce((a, it) => a + it.total, 0));
  const material_total = round2(material.reduce((a, it) => a + it.total, 0));
  const labor_cost = round2(labor.reduce((a, it) => a + it.cost, 0));
  const material_cost = round2(material.reduce((a, it) => a + it.cost, 0));
  const commission = round2(labor_total + material_total - labor_cost - material_cost);
  return { labor_total, material_total, labor_cost, material_cost, commission };
}

// ---- SEASONAL invoice ------------------------------------------------------
export async function createSeasonalInvoice(fd: FormData) {
  const profile = await getProfile();
  // Seasonal exige financials.full OU invoices.seasonal (RLS confirma).
  if (!can(profile, "financials.full") && !can(profile, "invoices.seasonal")) {
    throw new Error("You do not have access to seasonal invoices.");
  }

  const supabase = createClient();

  // Entradas brutas.
  const room_fee = num(fd, "room_fee");
  const rental_nights = numOrNull(fd, "rental_nights");
  const rental_discount = num(fd, "rental_discount");
  const cleaning_fee = num(fd, "cleaning_fee");
  const guest_service_fee = num(fd, "guest_service_fee");
  const occupancy_taxes = num(fd, "occupancy_taxes");
  const vrbo_property_damage = num(fd, "vrbo_property_damage");
  const host_payout = num(fd, "host_payout");
  const host_service_fee = num(fd, "host_service_fee");
  const commission_rate = num(fd, "commission_rate"); // já em fração (0.10)
  const commission_base: SeasonalCommissionBase =
    str(fd, "commission_base") === "paid_by_guest" ? "paid_by_guest" : "host_payout";
  const cleaning_goes_to = (str(fd, "cleaning_goes_to") as CleaningDestination | null) ?? "owner";

  // Deduções extras do owner.
  type Extra = { description: string; total: number };
  const extras: Extra[] = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const description = str(fd, `extra_${i}_description`);
    const amountRaw = str(fd, `extra_${i}_amount`);
    if (!description && !amountRaw) continue;
    extras.push({ description: description ?? "Deduction", total: round2(Number(amountRaw ?? 0) || 0) });
  }

  // Pagamentos extras do GUEST (somam no Total Paid by Guest).
  const guestExtras: Extra[] = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const description = str(fd, `guest_extra_${i}_description`);
    const amountRaw = str(fd, `guest_extra_${i}_amount`);
    if (!description && !amountRaw) continue;
    guestExtras.push({ description: description ?? "Extra payment", total: round2(Number(amountRaw ?? 0) || 0) });
  }

  // FÓRMULA TRAVADA — recomputada no servidor (não confia no cliente).
  const computed = computeSeasonal({
    room_fee,
    rental_discount,
    cleaning_fee,
    guest_service_fee,
    occupancy_taxes,
    vrbo_property_damage,
    host_payout,
    host_service_fee,
    commission_rate,
    commission_base,
    cleaning_goes_to,
    extra_deductions: extras.map((e) => e.total),
    extra_charges: guestExtras.map((e) => e.total),
  });

  const platform = str(fd, "platform");

  // Auto-preenche o cleaner padrão da propriedade (só quando a By the C paga o
  // cleaner). A Andrea pode sobrescrever no payout do invoice. Interno (pra 1099s).
  const propertyId = str(fd, "property_id");
  let defaultCleanerId: string | null = null;
  let defaultCleanerAmount: number | null = null;
  if (cleaning_goes_to === "bythec" && propertyId) {
    const { data: prop } = await supabase
      .from("properties")
      .select("default_cleaner_id, default_cleaner_amount")
      .eq("id", propertyId)
      .maybeSingle();
    const pp = prop as
      | { default_cleaner_id: string | null; default_cleaner_amount: number | null }
      | null;
    defaultCleanerId = pp?.default_cleaner_id ?? null;
    defaultCleanerAmount = pp?.default_cleaner_amount ?? null;
  }

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      kind: "seasonal",
      client_id: str(fd, "client_id"),
      property_id: propertyId,
      cleaner_id: defaultCleanerId,
      cleaner_amount_paid: defaultCleanerAmount,
      platform,
      date: str(fd, "date"),
      due_date: str(fd, "due_date"),
      guest_name: str(fd, "guest_name"),
      dates_reserved_start: str(fd, "dates_reserved_start"),
      dates_reserved_end: str(fd, "dates_reserved_end"),
      notes: str(fd, "notes"),
      room_fee,
      rental_nights,
      rental_discount,
      cleaning_fee,
      guest_service_fee,
      occupancy_taxes,
      lodging_taxes_vrbo: platform === "VRBO" ? occupancy_taxes : null,
      vrbo_property_damage: platform === "VRBO" ? vrbo_property_damage : null,
      host_payout,
      host_service_fee,
      cleaning_goes_to,
      total_paid_by_guest: computed.total_paid_by_guest,
      bythec_commission: computed.bythec_commission,
      commission_base,
      commission_rate,
      total_received_by_owner: computed.total_received_by_owner,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // Itens de linha pro view 2 colunas (guest/owner). type=charge; sinal pelo valor.
  const itemRows: Array<{
    invoice_id: string;
    description: string;
    total: number;
    type: "charge" | "discount" | "fee";
    guest: boolean;
    owner: boolean;
  }> = [];

  // Coluna Paid by Guest.
  itemRows.push({ invoice_id: data.id, description: "Rental Nights", total: room_fee, type: "charge", guest: true, owner: false });
  if (rental_discount) itemRows.push({ invoice_id: data.id, description: "Rental Discount", total: -Math.abs(rental_discount), type: "discount", guest: true, owner: false });
  if (cleaning_fee) itemRows.push({ invoice_id: data.id, description: "Cleaning Fee", total: cleaning_fee, type: "charge", guest: true, owner: false });
  if (guest_service_fee) itemRows.push({ invoice_id: data.id, description: "Guest Service Fee", total: guest_service_fee, type: "fee", guest: true, owner: false });
  if (occupancy_taxes) itemRows.push({ invoice_id: data.id, description: platform === "VRBO" ? "Lodging Taxes" : "Occupancy Taxes", total: occupancy_taxes, type: "fee", guest: true, owner: false });
  if (platform === "VRBO" && vrbo_property_damage) itemRows.push({ invoice_id: data.id, description: "Property Damage Protection", total: vrbo_property_damage, type: "fee", guest: true, owner: false });
  // Pagamentos extras do guest (positivos; somam no total do guest).
  for (const ge of guestExtras) {
    itemRows.push({ invoice_id: data.id, description: ge.description, total: ge.total, type: "charge", guest: true, owner: false });
  }

  // Coluna Owner Overview. Itens são as PARCELAS que somam pro Total Received by
  // Owner: host_payout − host_service_fee − commission − (cleaning se bythec) − extras.
  // Quando cleaning fica com o owner, ele NÃO entra na coluna do owner (já aparece
  // na coluna do guest); só aparece como dedução quando vai pra By the C.
  itemRows.push({ invoice_id: data.id, description: "Host Payout", total: host_payout, type: "charge", guest: false, owner: true });
  if (host_service_fee) itemRows.push({ invoice_id: data.id, description: "Platform Host Service Fee", total: -Math.abs(host_service_fee), type: "fee", guest: false, owner: true });
  if (cleaning_fee && cleaning_goes_to === "bythec") itemRows.push({ invoice_id: data.id, description: "Cleaning Fee (By the C)", total: -Math.abs(cleaning_fee), type: "fee", guest: false, owner: true });
  itemRows.push({ invoice_id: data.id, description: "By the C Commission", total: -Math.abs(computed.bythec_commission), type: "fee", guest: false, owner: true });
  for (const ex of extras) {
    itemRows.push({ invoice_id: data.id, description: ex.description, total: -Math.abs(ex.total), type: "fee", guest: false, owner: true });
  }

  const { error: itemsErr } = await supabase.from("invoice_items").insert(itemRows);
  if (itemsErr) throw new Error(itemsErr.message);

  revalidatePath("/invoices");
  redirect(`/invoices/${data.id}`);
}

// ---- Update (notes/dates light edit) ---------------------------------------
// V1: edição leve de campos não-financeiros (notes, due_date). Edição completa
// dos números seasonal é refazer/recriar — mantém a fórmula sempre consistente.
export async function updateInvoice(id: string, fd: FormData) {
  const profile = await getProfile();
  const supabase = createClient();

  const { data: inv } = await supabase.from("invoices").select("kind").eq("id", id).single();
  if (!inv) throw new Error("Invoice not found.");
  const isSeasonal = inv.kind === "seasonal";
  if (isSeasonal && !can(profile, "financials.full") && !can(profile, "invoices.seasonal")) {
    throw new Error("You do not have access to seasonal invoices.");
  }
  if (!isSeasonal && !can(profile, "financials.full") && !can(profile, "invoices.service")) {
    throw new Error("You do not have access to edit this invoice.");
  }

  const { error } = await supabase
    .from("invoices")
    .update({
      due_date: str(fd, "due_date"),
      notes: str(fd, "notes"),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  redirect(`/invoices/${id}`);
}

// ---- Paid toggle (regime de caixa) -----------------------------------------
// "Owner paid". Em SERVICE, marcar pago AUTO-marca a comissão como recebida
// (ela entra junto com o pagamento do owner) — a Andrea pode desmarcar depois.
export async function setPaid(id: string, paid: boolean) {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: inv } = await supabase
    .from("invoices")
    .select("kind, commission_collected")
    .eq("id", id)
    .maybeSingle();
  const row = inv as { kind: string; commission_collected: boolean } | null;

  const update: Record<string, unknown> = { paid, paid_date: paid ? today : null };
  // Auto-tick da comissão só no service e só quando marca PAGO (não desfaz ao despagar).
  if (paid && row?.kind === "service" && !row.commission_collected) {
    update.commission_collected = true;
    update.commission_collected_at = today;
  }

  const { error } = await supabase.from("invoices").update(update).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
}

// ---- SERVICE tracking toggles (5 estados) ----------------------------------
// Cada toggle carimba a data (hoje) ao marcar; limpa ao desmarcar. Datas
// editáveis pelos *Date setters abaixo (a UI mostra o campo quando marcado).
async function setServiceFlag(
  id: string,
  flagCol: string,
  dateCol: string,
  value: boolean
) {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("invoices")
    .update({ [flagCol]: value, [dateCol]: value ? today : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
}

export async function setSentToOwner(id: string, v: boolean) {
  await setServiceFlag(id, "sent_to_owner", "sent_at", v);
}
export async function setLaborPaid(id: string, v: boolean) {
  await setServiceFlag(id, "labor_paid", "labor_paid_at", v);
}
export async function setMaterialPaid(id: string, v: boolean) {
  await setServiceFlag(id, "material_paid", "material_paid_at", v);
}
export async function setCommissionCollected(id: string, v: boolean) {
  await setServiceFlag(id, "commission_collected", "commission_collected_at", v);
}

// Datas editáveis dos estados (YYYY-MM-DD; vazio limpa). São colunas `date`.
async function setServiceDate(id: string, dateCol: string, ymd: string | null) {
  const supabase = createClient();
  const v = ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd.trim()) ? ymd.trim() : null;
  const { error } = await supabase.from("invoices").update({ [dateCol]: v }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
}

export async function setSentDate(id: string, ymd: string | null) {
  await setServiceDate(id, "sent_at", ymd);
}
export async function setLaborPaidDate(id: string, ymd: string | null) {
  await setServiceDate(id, "labor_paid_at", ymd);
}
export async function setMaterialPaidDate(id: string, ymd: string | null) {
  await setServiceDate(id, "material_paid_at", ymd);
}
export async function setCommissionCollectedDate(id: string, ymd: string | null) {
  await setServiceDate(id, "commission_collected_at", ymd);
}

// Provider (worker) que fez o serviço. Opcional (crew interno deixa vazio).
export async function setServiceProvider(id: string, providerId: string | null) {
  const supabase = createClient();
  const v = providerId && providerId.trim() ? providerId.trim() : null;
  const { error } = await supabase.from("invoices").update({ provider_id: v }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
}

// Cleaner pago pela By the C (só faz sentido em seasonal com cleaning_goes_to =
// 'bythec'). Interno — não vai pro PDF. Carimba a data como o commission_paid.
export async function setCleanerPaid(id: string, cleanerPaid: boolean) {
  const supabase = createClient();
  const { error } = await supabase
    .from("invoices")
    .update({
      cleaner_paid: cleanerPaid,
      cleaner_paid_at: cleanerPaid ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
}

// Como o owner/cleaner foi pago (interno). Método é texto livre vindo do dropdown
// (eCheck/Check/Cash/Zelle/Stripe/Other); string vazia limpa o campo.
const PAYOUT_METHODS = ["eCheck", "Check", "Cash", "Zelle", "Stripe", "Other"];
function normalizeMethod(method: string | null): string | null {
  if (!method) return null;
  const m = method.trim();
  if (!m) return null;
  return PAYOUT_METHODS.includes(m) ? m : "Other";
}

export async function setOwnerPaymentMethod(id: string, method: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ owner_payment_method: normalizeMethod(method) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
}

export async function setCleanerPaymentMethod(id: string, method: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ cleaner_payment_method: normalizeMethod(method) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
}

// Nº do cheque (owner/cleaner). String vazia limpa. Trim + limite defensivo.
function normalizeCheckNumber(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim().slice(0, 40);
  return v || null;
}

export async function setOwnerCheckNumber(id: string, value: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ owner_check_number: normalizeCheckNumber(value) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
}

export async function setCleanerCheckNumber(id: string, value: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ cleaner_check_number: normalizeCheckNumber(value) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
}

// Data do repasse. Owner usa paid_date (coluna date); cleaner usa cleaner_paid_at
// (timestamptz → meio-dia UTC pra não driftar o dia). YYYY-MM-DD; vazio limpa.
// Vira OBRIGATÓRIO na UI quando o método é Zelle (sem nº de cheque pra rastrear).
function ymdOrNull(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function setInvoicePaidDate(id: string, ymd: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ paid_date: ymdOrNull(ymd) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
}

export async function setCleanerPaidDate(id: string, ymd: string | null) {
  const supabase = createClient();
  const d = ymdOrNull(ymd);
  const { error } = await supabase
    .from("invoices")
    .update({ cleaner_paid_at: d ? `${d}T12:00:00.000Z` : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
}

// Qual cleaner (service_provider) recebeu — pra agrupar totais de 1099. Interno.
export async function setCleanerId(id: string, cleanerId: string | null) {
  const supabase = createClient();
  const v = cleanerId && cleanerId.trim() ? cleanerId.trim() : null;
  const { error } = await supabase
    .from("invoices")
    .update({ cleaner_id: v })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
}

// Quanto a By the C REALMENTE paga o cleaner (pode ser < cleaning_fee; a diferença
// fica de ganho da By the C). Interno — nunca vai pro PDF do owner.
export async function setCleanerAmountPaid(id: string, amount: number | null) {
  const supabase = createClient();
  const v = amount != null && Number.isFinite(amount) && amount >= 0 ? amount : null;
  const { error } = await supabase
    .from("invoices")
    .update({ cleaner_amount_paid: v })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
}

// ---- Archive (NUNCA deletar) -----------------------------------------------
export async function archiveInvoice(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
  redirect("/invoices");
}

export async function unarchiveInvoice(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
}

// ---- INVOICE ATTACHMENTS (recibos pro PDF combinado) -----------------------
// Acesso por kind da invoice: full vê tudo; invoices.service só service;
// invoices.seasonal só seasonal. Espelha o RLS de invoice_attachments.
async function assertCanAccessInvoice(invoiceId: string): Promise<{ kind: string }> {
  const profile = await getProfile();
  const supabase = createClient();
  const { data: inv } = await supabase
    .from("invoices")
    .select("kind")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) throw new Error("Invoice not found.");
  const kind = (inv as { kind: string }).kind;
  const ok =
    can(profile, "financials.full") ||
    (kind === "service" && can(profile, "invoices.service")) ||
    (kind === "seasonal" && can(profile, "invoices.seasonal"));
  if (!ok) throw new Error("You do not have access to this invoice.");
  return { kind };
}

// Anexa um recibo (já subido client-side pro bucket `documents`) à invoice.
export async function addInvoiceAttachmentAction(fd: FormData) {
  const invoiceId = str(fd, "invoice_id");
  if (!invoiceId) throw new Error("Missing invoice reference.");
  await assertCanAccessInvoice(invoiceId);

  const fileUrl = str(fd, "file_url");
  if (!fileUrl) throw new Error("Missing file.");

  // Categoria separa recibo do hóspede (entra no PDF combinado) dos recibos de
  // repasse owner/cleaner (internos). Default guest_receipt pra compatibilidade.
  const rawCategory = str(fd, "category");
  const category =
    rawCategory === "owner_payout" || rawCategory === "cleaner_payout"
      ? rawCategory
      : "guest_receipt";

  const supabase = createClient();
  const { error } = await supabase.from("invoice_attachments").insert({
    invoice_id: invoiceId,
    file_url: fileUrl,
    file_name: str(fd, "file_name"),
    content_type: str(fd, "content_type"),
    category,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${invoiceId}`);
}

// Remove um anexo da invoice (some o registro; o arquivo no bucket é inofensivo).
export async function deleteInvoiceAttachmentAction(fd: FormData) {
  const invoiceId = str(fd, "invoice_id");
  const id = str(fd, "id");
  if (!invoiceId || !id) throw new Error("Missing reference.");
  await assertCanAccessInvoice(invoiceId);

  const supabase = createClient();
  const { error } = await supabase.from("invoice_attachments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${invoiceId}`);
}

// ---- FULL EDIT: seasonal --------------------------------------------------
// Espelha createSeasonalInvoice mas ATUALIZA a linha e REESCREVE os itens.
// Recalcula pela fórmula travada (computeSeasonal) — números nunca vêm do cliente.
export async function updateSeasonalInvoice(id: string, fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "financials.full") && !can(profile, "invoices.seasonal")) {
    throw new Error("You do not have access to seasonal invoices.");
  }
  const supabase = createClient();

  const room_fee = num(fd, "room_fee");
  const rental_nights = numOrNull(fd, "rental_nights");
  const rental_discount = num(fd, "rental_discount");
  const cleaning_fee = num(fd, "cleaning_fee");
  const guest_service_fee = num(fd, "guest_service_fee");
  const occupancy_taxes = num(fd, "occupancy_taxes");
  const vrbo_property_damage = num(fd, "vrbo_property_damage");
  const host_payout = num(fd, "host_payout");
  const host_service_fee = num(fd, "host_service_fee");
  const commission_rate = num(fd, "commission_rate");
  const commission_base: SeasonalCommissionBase =
    str(fd, "commission_base") === "paid_by_guest" ? "paid_by_guest" : "host_payout";
  const cleaning_goes_to = (str(fd, "cleaning_goes_to") as CleaningDestination | null) ?? "owner";

  type Extra = { description: string; total: number };
  const extras: Extra[] = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const description = str(fd, `extra_${i}_description`);
    const amountRaw = str(fd, `extra_${i}_amount`);
    if (!description && !amountRaw) continue;
    extras.push({ description: description ?? "Deduction", total: round2(Number(amountRaw ?? 0) || 0) });
  }
  const guestExtras: Extra[] = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const description = str(fd, `guest_extra_${i}_description`);
    const amountRaw = str(fd, `guest_extra_${i}_amount`);
    if (!description && !amountRaw) continue;
    guestExtras.push({ description: description ?? "Extra payment", total: round2(Number(amountRaw ?? 0) || 0) });
  }

  const computed = computeSeasonal({
    room_fee,
    rental_discount,
    cleaning_fee,
    guest_service_fee,
    occupancy_taxes,
    vrbo_property_damage,
    host_payout,
    host_service_fee,
    commission_rate,
    commission_base,
    cleaning_goes_to,
    extra_deductions: extras.map((e) => e.total),
    extra_charges: guestExtras.map((e) => e.total),
  });
  const platform = str(fd, "platform");

  const { error } = await supabase
    .from("invoices")
    .update({
      client_id: str(fd, "client_id"),
      property_id: str(fd, "property_id"),
      platform,
      date: str(fd, "date"),
      due_date: str(fd, "due_date"),
      guest_name: str(fd, "guest_name"),
      dates_reserved_start: str(fd, "dates_reserved_start"),
      dates_reserved_end: str(fd, "dates_reserved_end"),
      notes: str(fd, "notes"),
      room_fee,
      rental_nights,
      rental_discount,
      cleaning_fee,
      guest_service_fee,
      occupancy_taxes,
      lodging_taxes_vrbo: platform === "VRBO" ? occupancy_taxes : null,
      vrbo_property_damage: platform === "VRBO" ? vrbo_property_damage : null,
      host_payout,
      host_service_fee,
      cleaning_goes_to,
      total_paid_by_guest: computed.total_paid_by_guest,
      bythec_commission: computed.bythec_commission,
      commission_base,
      commission_rate,
      total_received_by_owner: computed.total_received_by_owner,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Reescreve os itens (mesma montagem do create).
  await supabase.from("invoice_items").delete().eq("invoice_id", id);
  const itemRows: Array<{
    invoice_id: string; description: string; total: number;
    type: "charge" | "discount" | "fee"; guest: boolean; owner: boolean;
  }> = [];
  itemRows.push({ invoice_id: id, description: "Rental Nights", total: room_fee, type: "charge", guest: true, owner: false });
  if (rental_discount) itemRows.push({ invoice_id: id, description: "Rental Discount", total: -Math.abs(rental_discount), type: "discount", guest: true, owner: false });
  if (cleaning_fee) itemRows.push({ invoice_id: id, description: "Cleaning Fee", total: cleaning_fee, type: "charge", guest: true, owner: false });
  if (guest_service_fee) itemRows.push({ invoice_id: id, description: "Guest Service Fee", total: guest_service_fee, type: "fee", guest: true, owner: false });
  if (occupancy_taxes) itemRows.push({ invoice_id: id, description: platform === "VRBO" ? "Lodging Taxes" : "Occupancy Taxes", total: occupancy_taxes, type: "fee", guest: true, owner: false });
  if (platform === "VRBO" && vrbo_property_damage) itemRows.push({ invoice_id: id, description: "Property Damage Protection", total: vrbo_property_damage, type: "fee", guest: true, owner: false });
  for (const ge of guestExtras) {
    itemRows.push({ invoice_id: id, description: ge.description, total: ge.total, type: "charge", guest: true, owner: false });
  }
  itemRows.push({ invoice_id: id, description: "Host Payout", total: host_payout, type: "charge", guest: false, owner: true });
  if (host_service_fee) itemRows.push({ invoice_id: id, description: "Platform Host Service Fee", total: -Math.abs(host_service_fee), type: "fee", guest: false, owner: true });
  if (cleaning_fee && cleaning_goes_to === "bythec") itemRows.push({ invoice_id: id, description: "Cleaning Fee (By the C)", total: -Math.abs(cleaning_fee), type: "fee", guest: false, owner: true });
  itemRows.push({ invoice_id: id, description: "By the C Commission", total: -Math.abs(computed.bythec_commission), type: "fee", guest: false, owner: true });
  for (const ex of extras) {
    itemRows.push({ invoice_id: id, description: ex.description, total: -Math.abs(ex.total), type: "fee", guest: false, owner: true });
  }
  const { error: itemsErr } = await supabase.from("invoice_items").insert(itemRows);
  if (itemsErr) throw new Error(itemsErr.message);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  redirect(`/invoices/${id}`);
}

// ---- FULL EDIT: service ---------------------------------------------------
export async function updateServiceInvoice(id: string, fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "financials.full") && !can(profile, "invoices.service")) {
    throw new Error("You do not have access to edit this invoice.");
  }
  const supabase = createClient();

  const items = readServiceItems(fd);
  const t = serviceTotals(items);

  const { error } = await supabase
    .from("invoices")
    .update({
      client_id: str(fd, "client_id"),
      property_id: str(fd, "property_id"),
      provider_id: str(fd, "provider_id"),
      service_address: str(fd, "service_address"),
      date: str(fd, "date"),
      work_date: str(fd, "work_date"),
      due_date: str(fd, "due_date"),
      notes: str(fd, "notes"),
      labor_total: t.labor_total,
      material_total: t.material_total,
      labor_cost: t.labor_cost,
      material_cost: t.material_cost,
      service_commission: t.commission,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("invoice_items").delete().eq("invoice_id", id);
  if (items.length > 0) {
    const { error: itemsErr } = await supabase.from("invoice_items").insert(
      items.map((it) => ({
        invoice_id: id,
        description: it.description,
        total: it.total,
        cost: it.cost,
        type: "charge" as const,
        category: it.category,
        guest: false,
        owner: false,
      }))
    );
    if (itemsErr) throw new Error(itemsErr.message);
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  redirect(`/invoices/${id}`);
}
