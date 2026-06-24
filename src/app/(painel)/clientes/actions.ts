"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ClientType, PropertyType, DealSide } from "@/lib/types";
import { getProfile } from "@/lib/auth/session";
import { canDelete, can } from "@/lib/auth/capabilities";

// Helpers de leitura de FormData -> valor limpo (string vazia -> null).
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
function bool(fd: FormData, key: string): boolean {
  return fd.get(key) === "on" || fd.get(key) === "true";
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

// ---- Clientes --------------------------------------------------------------

export async function createClienteAction(fd: FormData) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: str(fd, "name"),
      client_type: str(fd, "client_type") as ClientType,
      deal_side: (str(fd, "deal_side") as DealSide) ?? null,
      email: str(fd, "email"),
      phone: str(fd, "phone"),
      notes: str(fd, "notes"),
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
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
  redirect(`/clientes/${data.id}`);
}

export async function updateClienteAction(id: string, fd: FormData) {
  const supabase = createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      name: str(fd, "name"),
      client_type: str(fd, "client_type") as ClientType,
      deal_side: (str(fd, "deal_side") as DealSide) ?? null,
      email: str(fd, "email"),
      phone: str(fd, "phone"),
      notes: str(fd, "notes"),
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
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  redirect(`/clientes/${id}`);
}

// TRAVADO: NUNCA deletar — arquivar (archived_at = now).
export async function archiveClienteAction(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("clients")
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function unarchiveClienteAction(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("clients")
    .update({ archived_at: null, active: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
}

// HARD DELETE (permanente, irreversível) — OWNER ONLY. Delega TODA a regra
// (papel owner + precisa estar arquivado + cascade seguro) pra RPC server-side
// admin_delete_client, que dá raise exception com mensagem humana. Aqui só:
//  1) re-checa owner no servidor (defesa em profundidade; o banco também checa).
//  2) chama a RPC e propaga a mensagem do banco pro modal (não engole o erro).
//  3) em caso de sucesso, revalida e redireciona pra lista.
export async function deleteClienteAction(id: string) {
  const profile = await getProfile();
  if (!canDelete(profile)) {
    throw new Error("Only the owner can permanently delete records.");
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_delete_client", { c_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
  redirect("/clientes");
}

// ---- Notes (timeline polimórfica, parent_type='client') --------------------

// Cria nota presa ao cliente, direto da aba Notes do detalhe. Re-checa a
// capacidade clients.edit no servidor (defesa em profundidade; o RLS reforça).
// body é obrigatório; year opcional cai no ano corrente.
export async function addClientNoteAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "clients.edit")) {
    throw new Error("You do not have permission to add notes to clients.");
  }
  const clientId = str(fd, "parent_id");
  if (!clientId) throw new Error("Missing client reference.");
  const body = str(fd, "body");
  if (!body) throw new Error("The note cannot be empty.");
  const year = num(fd, "year") ?? new Date().getFullYear();

  const supabase = createClient();
  const { error } = await supabase.from("notes").insert({
    parent_type: "client",
    parent_id: clientId,
    body,
    year,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${clientId}`);
}

// ---- Propriedades (penduradas no cliente) ----------------------------------

export async function createPropriedadeAction(ownerId: string, fd: FormData) {
  const supabase = createClient();
  const address = str(fd, "address");
  const { error } = await supabase.from("properties").insert({
    owner_id: ownerId, // TRAVADO: auto-preenchido pelo cliente (entidade-mãe).
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
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${ownerId}`);
  revalidatePath("/propriedades");
}
