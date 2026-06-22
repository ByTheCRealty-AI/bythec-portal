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
import { computeSeasonal, round2 } from "@/lib/invoice-formula";
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

  // Itens: descrição + amount + category (labor|material).
  type SvcItem = { description: string; total: number; category: InvoiceItemCategory };
  const items: SvcItem[] = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const description = str(fd, `item_${i}_description`);
    const amountRaw = str(fd, `item_${i}_amount`);
    const category = (str(fd, `item_${i}_category`) as InvoiceItemCategory | null) ?? "labor";
    if (!description && !amountRaw) continue;
    const total = round2(Number(amountRaw ?? 0) || 0);
    items.push({ description: description ?? "(no description)", total, category });
  }

  const labor_total = round2(
    items.filter((it) => it.category === "labor").reduce((a, it) => a + it.total, 0)
  );
  const material_total = round2(
    items.filter((it) => it.category === "material").reduce((a, it) => a + it.total, 0)
  );

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      kind: "service",
      client_id: str(fd, "client_id"),
      property_id: str(fd, "property_id"),
      service_address: str(fd, "service_address"),
      date: str(fd, "date"),
      due_date: str(fd, "due_date"),
      notes: str(fd, "notes"),
      labor_total,
      material_total,
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

// ---- SEASONAL invoice ------------------------------------------------------
export async function createSeasonalInvoice(fd: FormData) {
  const profile = await getProfile();
  // Seasonal exige financials.full (RLS confirma). invoices.service NÃO basta.
  if (!can(profile, "financials.full")) {
    throw new Error("Seasonal invoices require full financial access.");
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
  });

  const platform = str(fd, "platform");

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      kind: "seasonal",
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
  if (isSeasonal && !can(profile, "financials.full")) {
    throw new Error("Seasonal invoices require full financial access.");
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
export async function setPaid(id: string, paid: boolean) {
  const supabase = createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ paid, paid_date: paid ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
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
