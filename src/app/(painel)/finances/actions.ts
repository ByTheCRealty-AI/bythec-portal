"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";

// Finances = owner + manager (cap financials.full). A secretária NÃO acessa.
// Aqui só: marcar quando a comissão de venda ENTROU. O valor em si é lido da
// propriedade — o Finances não pede pra digitar de novo. O RLS reforça no banco.

// Marca a comissão de VENDA de uma listing como recebida (ou desmarca). O VALOR
// não passa por aqui — ele vive na propriedade (sale_commission, 0027) e é
// preenchido na aba Sales. Aqui é só o regime de caixa: quando o dinheiro entrou.
// Carimba a data de hoje em America/New_York ao marcar; limpa ao desmarcar.
export async function setSaleCommissionReceivedAction(
  propertyId: string,
  received: boolean
) {
  const profile = await getProfile();
  if (!can(profile, "financials.full")) {
    throw new Error("Only the owner and manager can edit finances.");
  }
  if (!propertyId) throw new Error("Missing property reference.");
  const supabase = createClient();
  const todayNY = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const { error } = await supabase
    .from("properties")
    .update({
      sale_commission_received: received,
      sale_commission_received_at: received ? todayNY : null,
    })
    .eq("id", propertyId)
    .eq("property_type", "for_sale");
  if (error) throw new Error(error.message);
  revalidatePath("/finances");
  revalidatePath("/sales");
  revalidatePath(`/propriedades/${propertyId}`);
}
