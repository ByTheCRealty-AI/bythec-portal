"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";

// Finances = owner + manager (cap financials.full). A secretária NÃO acessa.
// Aqui só: gravar a comissão de venda (sales/brokerage) que a Andrea/manager
// digita por deal fechado. O RLS de clients reforça no banco.

export async function setSaleCommissionAction(
  clientId: string,
  amount: number | null,
  received: boolean
) {
  const profile = await getProfile();
  if (!can(profile, "financials.full")) {
    throw new Error("Only the owner and manager can edit finances.");
  }
  if (!clientId) throw new Error("Missing deal reference.");
  const supabase = createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      sale_commission: amount,
      sale_commission_received: received,
    })
    .eq("id", clientId)
    .eq("client_type", "buy_sell_client");
  if (error) throw new Error(error.message);
  revalidatePath("/finances");
}
