"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/session";
import { can, canDelete } from "@/lib/auth/capabilities";

// Helpers de FormData -> valor limpo (string vazia -> null).
function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

// Cria um lembrete. created_by = usuário logado (server-side, nunca do cliente).
export async function createReminderAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "reminders.manage")) {
    throw new Error("You do not have permission to create reminders.");
  }
  const title = str(fd, "title");
  if (!title) throw new Error("The reminder needs a title.");
  const assignedTo = str(fd, "assigned_to");
  if (!assignedTo) throw new Error("Pick who is responsible for this reminder.");

  const supabase = createClient();
  const { error } = await supabase.from("reminders").insert({
    title,
    notes: str(fd, "notes"),
    assigned_to: assignedTo,
    created_by: profile!.id,
    due_date: str(fd, "due_date"),
    client_id: str(fd, "client_id"),
    property_id: str(fd, "property_id"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/reminders");
  revalidatePath("/");
}

// Edita título / notas / responsável / due date / link de um lembrete.
export async function updateReminderAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "reminders.manage")) {
    throw new Error("You do not have permission to edit reminders.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing reminder reference.");
  const title = str(fd, "title");
  if (!title) throw new Error("The reminder needs a title.");
  const assignedTo = str(fd, "assigned_to");
  if (!assignedTo) throw new Error("Pick who is responsible for this reminder.");

  const supabase = createClient();
  const { error } = await supabase
    .from("reminders")
    .update({
      title,
      notes: str(fd, "notes"),
      assigned_to: assignedTo,
      due_date: str(fd, "due_date"),
      client_id: str(fd, "client_id"),
      property_id: str(fd, "property_id"),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/reminders");
  revalidatePath("/");
}

// Check-off / reabrir. done zera a escalação na hora (computada ao vivo).
export async function setReminderStatusAction(id: string, done: boolean) {
  const profile = await getProfile();
  if (!can(profile, "reminders.manage")) {
    throw new Error("You do not have permission to update reminders.");
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("reminders")
    .update({
      status: done ? "done" : "open",
      done_at: done ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/reminders");
  revalidatePath("/");
}

// TRAVADO: arquivar, nunca deletar (a não ser owner hard-delete via RLS).
export async function archiveReminderAction(id: string) {
  const profile = await getProfile();
  if (!can(profile, "reminders.manage")) {
    throw new Error("You do not have permission to archive reminders.");
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("reminders")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/reminders");
  revalidatePath("/");
}

// HARD DELETE — OWNER ONLY. RLS reforça (policy reminders_delete = owner).
export async function deleteReminderAction(id: string) {
  const profile = await getProfile();
  if (!canDelete(profile)) {
    throw new Error("Only the owner can permanently delete reminders.");
  }
  const supabase = createClient();
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/reminders");
  revalidatePath("/");
}
