"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PropertyType } from "@/lib/types";
import { getProfile } from "@/lib/auth/session";
import { canDelete } from "@/lib/auth/capabilities";

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
// Seasonal commission % (input em %) -> fração. Default 0.10 se vazio/inválido.
function seasonalRate(fd: FormData): number {
  const pct = num(fd, "seasonal_commission_pct");
  if (pct === null || !Number.isFinite(pct)) return 0.1;
  return pct / 100;
}
// Base do % seasonal. Default 'host_payout' (maioria das casas).
function seasonalBase(fd: FormData): "host_payout" | "paid_by_guest" {
  return str(fd, "seasonal_commission_base") === "paid_by_guest" ? "paid_by_guest" : "host_payout";
}

// Cria propriedade direto da tela /propriedades/novo. O owner_id vem do picker
// do formulário (entidade-mãe obrigatória). Espelha createPropriedadeAction do
// fluxo do cliente, mas standalone.
export async function createPropriedadeStandaloneAction(fd: FormData) {
  const supabase = createClient();
  const ownerId = str(fd, "owner_id");
  if (!ownerId) throw new Error("An owner is required to create a property.");
  const address = str(fd, "address");
  const { data, error } = await supabase
    .from("properties")
    .insert({
      owner_id: ownerId, // TRAVADO: toda propriedade tem dono.
      address,
      address2: str(fd, "address2"),
      address_text: address ? address.toLowerCase() : null,
      property_type: str(fd, "property_type") as PropertyType,
      commission_fee: num(fd, "commission_fee"),
      seasonal_commission_rate: seasonalRate(fd),
      seasonal_commission_base: seasonalBase(fd),
      rent_price: num(fd, "rent_price"),
      rent_due_day: num(fd, "rent_due_day"),
      rent_frequency: str(fd, "rent_frequency"),
      rental_start: str(fd, "rental_start"),
      rental_end: str(fd, "rental_end"),
      notes: str(fd, "notes"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/propriedades");
  revalidatePath(`/clientes/${ownerId}`);
  redirect(`/propriedades/${data.id}`);
}

export async function updatePropriedadeAction(id: string, fd: FormData) {
  const supabase = createClient();
  const address = str(fd, "address");
  const { error } = await supabase
    .from("properties")
    .update({
      address,
      address2: str(fd, "address2"),
      address_text: address ? address.toLowerCase() : null,
      property_type: str(fd, "property_type") as PropertyType, // mudar tipo carrega histórico
      commission_fee: num(fd, "commission_fee"),
      seasonal_commission_rate: seasonalRate(fd),
      seasonal_commission_base: seasonalBase(fd),
      rent_price: num(fd, "rent_price"),
      rent_due_day: num(fd, "rent_due_day"),
      rent_frequency: str(fd, "rent_frequency"),
      rental_start: str(fd, "rental_start"),
      rental_end: str(fd, "rental_end"),
      notes: str(fd, "notes"),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${id}`);
  revalidatePath("/propriedades");
  redirect(`/propriedades/${id}`);
}

// TRAVADO: arquivar, nunca deletar.
export async function archivePropriedadeAction(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("properties")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/propriedades");
  redirect("/propriedades");
}

export async function unarchivePropriedadeAction(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("properties")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${id}`);
}

// HARD DELETE (permanente, irreversível) — OWNER ONLY. Delega TODA a regra
// (papel owner + precisa estar arquivada + cascade seguro) pra RPC server-side
// admin_delete_property, que dá raise exception com mensagem humana. Aqui só:
//  1) re-checa owner no servidor (defesa em profundidade; o banco também checa).
//  2) chama a RPC e propaga a mensagem do banco pro modal (não engole o erro).
//  3) em caso de sucesso, revalida e redireciona pra lista.
export async function deletePropriedadeAction(id: string) {
  const profile = await getProfile();
  if (!canDelete(profile)) {
    throw new Error("Only the owner can permanently delete records.");
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_delete_property", { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/propriedades");
  redirect("/propriedades");
}
