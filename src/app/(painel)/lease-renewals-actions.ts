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

// Rastreio da renovação (Andrea 2026-09-28): "enviei a renovação" no Overview,
// e na página da propriedade também a resposta do inquilino + o que mudou
// (novo aluguel e novas datas). É REGISTRO: não altera rent_price/rental_* sozinho.
export async function setRenewalSentAction(propertyId: string, sent: boolean) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit")) throw new Error("No permission.");
  const supabase = createClient();
  const { error } = await supabase
    .from("properties")
    .update(
      sent
        ? { renewal_sent_at: new Date().toISOString().slice(0, 10) }
        : { renewal_sent_at: null, renewal_response: null, renewal_response_at: null }
    )
    .eq("id", propertyId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/propriedades/${propertyId}`);
}

export async function setRenewalDetailsAction(
  propertyId: string,
  patch: {
    sent: boolean;
    response: "accepted" | "declined" | null;
    newRent: number | null;
    newStart: string | null;
    newEnd: string | null;
  }
) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit")) throw new Error("No permission.");
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: cur } = await supabase
    .from("properties")
    .select("renewal_sent_at, renewal_response, renewal_response_at")
    .eq("id", propertyId)
    .maybeSingle();
  const c = (cur ?? {}) as { renewal_sent_at: string | null; renewal_response: string | null; renewal_response_at: string | null };
  const { error } = await supabase
    .from("properties")
    .update({
      // Mantém a data original de envio/resposta; só carimba quando muda de estado.
      renewal_sent_at: patch.sent ? c.renewal_sent_at ?? today : null,
      renewal_response: patch.sent ? patch.response : null,
      renewal_response_at: patch.sent && patch.response ? (c.renewal_response === patch.response ? c.renewal_response_at ?? today : today) : null,
      renewal_new_rent: patch.newRent,
      renewal_new_start: patch.newStart,
      renewal_new_end: patch.newEnd,
    })
    .eq("id", propertyId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/propriedades/${propertyId}`);
}
