"use server";

// =============================================================================
// Overview "Lease renewals" — descartar / restaurar um aviso de renovação.
// Descartar guarda a rental_end ATUAL (server-side, não confia no cliente); o
// aviso some enquanto renewal_dismissed_for = rental_end. Se o lease renovar
// (nova end date), o aviso volta. Gate = properties.edit (owner/manager/secretary).
// =============================================================================

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";

export async function dismissRenewalAction(propertyId: string) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit")) throw new Error("No permission.");
  const supabase = createClient();
  const { data } = await supabase
    .from("properties")
    .select("rental_end")
    .eq("id", propertyId)
    .maybeSingle();
  const end = (data as { rental_end: string | null } | null)?.rental_end ?? null;
  if (!end) return;
  const { error } = await supabase
    .from("properties")
    .update({ renewal_dismissed_for: end })
    .eq("id", propertyId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function restoreRenewalAction(propertyId: string) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit")) throw new Error("No permission.");
  const supabase = createClient();
  const { error } = await supabase
    .from("properties")
    .update({ renewal_dismissed_for: null })
    .eq("id", propertyId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}
