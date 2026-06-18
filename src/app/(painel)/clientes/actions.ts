"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ClientType, PropertyType, DealSide } from "@/lib/types";

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
