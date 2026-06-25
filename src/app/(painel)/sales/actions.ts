"use server";

// =============================================================================
// By the C — Sales (brokerage) server actions
// =============================================================================
// Buy/sell clients are NORMAL `clients` rows (client_type='buy_sell_client').
// For-sale listings are NORMAL `properties` rows (property_type='for_sale').
// We never duplicate them — Sales just reads/writes the brokerage columns
// (deal_side, sales_stage, realtor_id on clients; realtor_id, sale_status on
// properties). Each action re-checks the capability server-side (defense in
// depth — RLS reinforces in the DB) and revalidates the relevant paths.
// =============================================================================

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ClientType, DealSide } from "@/lib/types";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";

// Reuse the same FormData helpers style as clientes/actions.ts.
function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

// ---- Create a buy/sell client straight from the Sales screen ---------------
// Produces a clients row that shows up in BOTH Sales and the main Clients list.
export async function addSalesClientAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "clients.edit")) {
    throw new Error("You do not have permission to add sales clients.");
  }
  const name = str(fd, "name");
  if (!name) throw new Error("Name is required.");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      client_type: "buy_sell_client" as ClientType,
      deal_side: (str(fd, "deal_side") as DealSide) ?? null,
      sales_stage: str(fd, "sales_stage"),
      realtor_id: str(fd, "realtor_id"),
      email: str(fd, "email"),
      phone: str(fd, "phone"),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/sales");
  revalidatePath("/clientes");
  if (data?.id) revalidatePath(`/clientes/${data.id}`);
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
