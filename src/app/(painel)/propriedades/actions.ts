"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PropertyType } from "@/lib/types";

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
