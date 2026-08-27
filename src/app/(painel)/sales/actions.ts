"use server";

// =============================================================================
// By the C — Sales (brokerage) server actions
// =============================================================================
// Buy/sell clients are NORMAL `clients` rows (is_buyer_seller). For-sale
// listings are NORMAL `properties` rows (is_for_sale). client_type and
// property_type are DERIVED by trigger (0042/0043) — never written directly.
// We never duplicate them — Sales just reads/writes the brokerage columns
// (deal_side, sales_stage, realtor_id on clients; realtor_id, sale_status on
// properties). Each action re-checks the capability server-side (defense in
// depth — RLS reinforces in the DB) and revalidates the relevant paths.
// =============================================================================

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { DealSide, DealStatus } from "@/lib/types";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";

// Reuse the same FormData helpers style as clientes/actions.ts.
function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}
function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true";
}
function numOrNull(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---- Create a buy/sell client straight from the Sales screen ---------------
// Produces a clients row that shows up in BOTH Sales and the main Clients list.
// Captura os MESMOS campos do form de Clients (co-client, endereço, notas,
// notificações) — Sales reusa as colunas billing_* como "Address".
export async function addSalesClientAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "clients.edit") && !can(profile, "clients.own")) {
    throw new Error("You do not have permission to add sales clients.");
  }
  const name = str(fd, "name");
  if (!name) throw new Error("Name is required.");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      created_by: profile?.id ?? null, // proveniência (realtor scope, migration 0021)
      is_buyer_seller: true, // client_type é derivado por trigger (0043)
      deal_side: (str(fd, "deal_side") as DealSide) ?? null,
      sales_stage: str(fd, "sales_stage"),
      realtor_id: str(fd, "realtor_id"),
      email: str(fd, "email"),
      phone: str(fd, "phone"),
      billing_address: str(fd, "billing_address"),
      billing_address2: str(fd, "billing_address2"),
      billing_city: str(fd, "billing_city"),
      billing_state: str(fd, "billing_state"),
      billing_zip: str(fd, "billing_zip"),
      co_client_name: str(fd, "co_client_name"),
      co_client_email: str(fd, "co_client_email"),
      co_client_phone: str(fd, "co_client_phone"),
      email_notifications: bool(fd, "email_notifications"),
      sms_notifications: bool(fd, "sms_notifications"),
      notes: str(fd, "notes"),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/sales");
  revalidatePath("/clientes");
  if (data?.id) revalidatePath(`/clientes/${data.id}`);
}

// ---- Create a FOR-SALE listing straight from the Sales screen --------------
// Produces a properties row (is_for_sale, sale_status='active') that
// shows up in BOTH the For sale tab and the main Properties list. owner_id = the
// seller (a client). Same properties.edit gate; RLS reinforces in the DB.
export async function addForSaleListingAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit") && !can(profile, "properties.own")) {
    throw new Error("You do not have permission to add listings.");
  }
  const ownerId = str(fd, "owner_id");
  if (!ownerId) throw new Error("A seller (owner) is required.");
  const address = str(fd, "address");
  if (!address) throw new Error("An address is required.");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("properties")
    .insert({
      owner_id: ownerId,
      created_by: profile?.id ?? null, // proveniência (realtor scope, migration 0021)
      address,
      address2: str(fd, "address2"),
      address_text: address.toLowerCase(),
      is_for_sale: true, // property_type é derivado por trigger (0042)
      sale_status: "active",
      // Comissão da VENDA (0027). Antes gravava commission_fee — que é a taxa do
      // ALUGUEL — então o valor sumia da propriedade e da tela de Sales.
      sale_price: numOrNull(fd, "sale_price"),
      sale_commission_rate: numOrNull(fd, "sale_commission_rate"),
      sale_commission: numOrNull(fd, "sale_commission"),
      realtor_id: str(fd, "realtor_id"),
      notes: str(fd, "notes"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/sales");
  revalidatePath("/propriedades");
  revalidatePath(`/clientes/${ownerId}`);
  if (data?.id) revalidatePath(`/propriedades/${data.id}`);
}

// ---- Inline edit of a buy/sell client's brokerage fields -------------------
// Used by the inline row selects (deal_side / sales_stage / realtor). Only the
// keys present in the FormData are updated, so a single-field select edit never
// clobbers the other two.
export async function updateSalesClientAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "clients.edit")) {
    throw new Error("You do not have permission to edit sales clients.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing client reference.");

  const patch: Record<string, string | null> = {};
  if (fd.has("deal_side")) patch.deal_side = (str(fd, "deal_side") as DealSide) ?? null;
  if (fd.has("sales_stage")) patch.sales_stage = str(fd, "sales_stage");
  if (fd.has("realtor_id")) patch.realtor_id = str(fd, "realtor_id");
  if (Object.keys(patch).length === 0) return;

  const supabase = createClient();
  const { error } = await supabase.from("clients").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/sales");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
}

// ---- Finish (or reopen) a buy/sell client's deal ---------------------------
// active = live board; closed = won; expired = no deal. Leaving active stamps
// deal_closed_at = today (en-CA gives the YYYY-MM-DD `date` Postgres wants in
// America/New_York). Reopening (active) clears the stamp. Same `clients.edit`
// gate as the other client edits.
export async function setDealOutcomeAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "clients.edit")) {
    throw new Error("You do not have permission to edit sales clients.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing client reference.");

  const status = (str(fd, "deal_status") as DealStatus | null) ?? "active";
  if (status !== "active" && status !== "closed" && status !== "expired") {
    throw new Error("Invalid deal status.");
  }

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  }); // YYYY-MM-DD
  const patch: Record<string, string | null> = {
    deal_status: status,
    deal_closed_at: status === "active" ? null : today,
  };

  const supabase = createClient();
  const { error } = await supabase.from("clients").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/sales");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
}

// ---- Inline edit of a for-sale listing's realtor ---------------------------
export async function setListingRealtorAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit")) {
    throw new Error("You do not have permission to edit listings.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing property reference.");

  const supabase = createClient();
  const { error } = await supabase
    .from("properties")
    .update({ realtor_id: str(fd, "realtor_id") })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/sales");
  revalidatePath(`/propriedades/${id}`);
}

// ---- Inline edit of a for-sale listing's sale status -----------------------
export async function setListingStatusAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit")) {
    throw new Error("You do not have permission to edit listings.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing property reference.");

  const supabase = createClient();
  const { error } = await supabase
    .from("properties")
    .update({ sale_status: str(fd, "sale_status") })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/sales");
  revalidatePath(`/propriedades/${id}`);
}

// YYYY-MM-DD ou null (limpa). Guarda contra lixo antes de tocar no banco.
function ymdOrNull(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

// ---- Editar a DATA de fechamento de um deal buy/sell (cliente que comprou /
// vendedor cuja casa vendeu). Antes era carimbada como "hoje" e imutável; agora
// a Andrea corrige/define. É a data que o Finances usa pra reconhecer a comissão.
export async function setDealClosedDateAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "clients.edit")) {
    throw new Error("You do not have permission to edit sales clients.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing client reference.");

  const supabase = createClient();
  const { error } = await supabase
    .from("clients")
    .update({ deal_closed_at: ymdOrNull(str(fd, "date")) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/sales");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/finances");
}

// ---- Editar preço de venda + % + comissão DIRETO na tabela For sale ---------
// A Andrea trabalha na tela Sales; antes esses campos só existiam no form de
// editar a propriedade. Campo vazio = null (limpa), não zero.
export async function setListingSaleMoneyAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit")) {
    throw new Error("You do not have permission to edit listings.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing property reference.");

  const supabase = createClient();
  const { error } = await supabase
    .from("properties")
    .update({
      sale_price: numOrNull(fd, "sale_price"),
      sale_commission_rate: numOrNull(fd, "sale_commission_rate"),
      sale_commission: numOrNull(fd, "sale_commission"),
    })
    .eq("id", id)
    .eq("is_for_sale", true);
  if (error) throw new Error(error.message);
  revalidatePath("/sales");
  revalidatePath(`/propriedades/${id}`);
  revalidatePath("/finances");
}

// ---- Editar a DATA em que uma listing For Sale foi vendida (properties.sold_at,
// migration 0034). Registro da listing — não muda a receita do Finances.
export async function setListingSoldDateAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit")) {
    throw new Error("You do not have permission to edit listings.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing property reference.");

  const supabase = createClient();
  const { error } = await supabase
    .from("properties")
    .update({ sold_at: ymdOrNull(str(fd, "date")) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/sales");
  revalidatePath(`/propriedades/${id}`);
  revalidatePath("/finances");
}
