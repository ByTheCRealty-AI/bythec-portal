"use server";

// CRUD de service providers. Create / update / delete. Gated por operations.edit
// (RLS reforça no banco). "Delete" = ARQUIVAR (TRAVADO: nunca deletar de verdade;
// preserva o histórico de services que apontam pro provider).
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import type { NotifyVia } from "@/lib/types";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}
function notifyVia(fd: FormData): NotifyVia {
  return str(fd, "notify_via") === "whatsapp" ? "whatsapp" : "email";
}
async function assertCanManage() {
  const profile = await getProfile();
  if (!can(profile, "operations.edit")) {
    throw new Error("You do not have permission to manage providers.");
  }
}

export async function createProviderAction(fd: FormData) {
  await assertCanManage();
  const name = str(fd, "name");
  if (!name) throw new Error("A provider name is required.");
  const supabase = createClient();
  const { error } = await supabase.from("service_providers").insert({
    name,
    service_type: str(fd, "service_type"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    contact_person: str(fd, "contact_person"),
    contact_phone: str(fd, "contact_phone"),
    preferred: str(fd, "preferred") === "1",
    notify_via: notifyVia(fd),
    notes: str(fd, "notes"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/providers");
}

export async function updateProviderAction(fd: FormData) {
  await assertCanManage();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing provider reference.");
  const name = str(fd, "name");
  if (!name) throw new Error("A provider name is required.");
  const supabase = createClient();
  const { error } = await supabase
    .from("service_providers")
    .update({
      name,
      service_type: str(fd, "service_type"),
      phone: str(fd, "phone"),
      email: str(fd, "email"),
      contact_person: str(fd, "contact_person"),
      contact_phone: str(fd, "contact_phone"),
      preferred: str(fd, "preferred") === "1",
      notify_via: notifyVia(fd),
      notes: str(fd, "notes"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/providers");
}

// Toggle rápido do star (preferred) — sem abrir o form inteiro.
export async function togglePreferredAction(fd: FormData) {
  await assertCanManage();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing provider reference.");
  const preferred = str(fd, "preferred") === "1";
  const supabase = createClient();
  const { error } = await supabase
    .from("service_providers")
    .update({ preferred, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/providers");
}

// Delete = arquivar. Some da lista (filtra archived_at) mas o histórico de
// services fica intacto. Recuperável.
export async function deleteProviderAction(fd: FormData) {
  await assertCanManage();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing provider reference.");
  const supabase = createClient();
  const { error } = await supabase
    .from("service_providers")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/providers");
}
