"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import type { PaidBy, ExpenseAttachment } from "@/lib/types";

// Expenses = owner + manager + secretária (cap expenses.manage). O RLS reforça no
// banco (policy expenses_rw = has_cap('expenses.manage')); aqui guardamos a UI +
// defesa em profundidade.

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
function paidByOf(fd: FormData): PaidBy | null {
  const v = str(fd, "paid_by");
  return v === "bythec" || v === "owner" || v === "tenant" || v === "other" ? v : null;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function gate() {
  const profile = await getProfile();
  if (!can(profile, "expenses.manage")) {
    throw new Error("You do not have permission to manage expenses.");
  }
}

export async function createExpenseAction(fd: FormData) {
  await gate();
  const description = str(fd, "description");
  if (!description) throw new Error("A description is required.");
  const price = num(fd, "price");
  if (price === null) throw new Error("An amount is required.");

  const supabase = createClient();
  const { data: created, error } = await supabase
    .from("expenses")
    .insert({
      description,
      price,
      date: str(fd, "date") ?? today(),
      due_date: str(fd, "due_date"),
      paid: str(fd, "paid") === "1",
      paid_by: paidByOf(fd),
      category: str(fd, "category"),
      vendor: str(fd, "vendor"),
      property_id: str(fd, "property_id"),
      client_id: str(fd, "client_id"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Recibos anexados JÁ na criação: subiram client-side pro bucket `documents`;
  // aqui gravamos as referências agora que a despesa tem id. Malformado = ignora.
  const stagedRaw = str(fd, "staged_receipts");
  if (stagedRaw && created?.id) {
    try {
      const staged = JSON.parse(stagedRaw) as { path?: string; name?: string; type?: string }[];
      const rows = (Array.isArray(staged) ? staged : [])
        .filter((s) => s && typeof s.path === "string" && s.path)
        .map((s) => ({
          expense_id: created.id as string,
          file_url: s.path as string,
          file_name: s.name ?? null,
          content_type: s.type ?? null,
        }));
      if (rows.length > 0) {
        const { error: attErr } = await supabase.from("expense_attachments").insert(rows);
        if (attErr) throw new Error(attErr.message);
      }
    } catch (err) {
      // Não derruba a despesa (já criada) — sinaliza o recibo.
      throw new Error(
        err instanceof Error
          ? `Expense saved, but a receipt could not be attached: ${err.message}`
          : "Expense saved, but a receipt could not be attached."
      );
    }
  }

  revalidatePath("/expenses");
}

export async function updateExpenseAction(fd: FormData) {
  await gate();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing expense reference.");
  const description = str(fd, "description");
  if (!description) throw new Error("A description is required.");
  const price = num(fd, "price");
  if (price === null) throw new Error("An amount is required.");

  const supabase = createClient();
  const { error } = await supabase
    .from("expenses")
    .update({
      description,
      price,
      date: str(fd, "date") ?? today(),
      due_date: str(fd, "due_date"),
      paid: str(fd, "paid") === "1",
      paid_by: paidByOf(fd),
      category: str(fd, "category"),
      vendor: str(fd, "vendor"),
      property_id: str(fd, "property_id"),
      client_id: str(fd, "client_id"),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/expenses");
}

// Toggle rápido do status pago/não pago direto na lista.
export async function setExpensePaidAction(id: string, paid: boolean) {
  await gate();
  if (!id) throw new Error("Missing expense reference.");
  const supabase = createClient();
  const { error } = await supabase.from("expenses").update({ paid }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/expenses");
}

export async function deleteExpenseAction(fd: FormData) {
  await gate();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing expense reference.");
  const supabase = createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/expenses");
}

// Recibo (qualquer mídia): o arquivo já subiu client-side pro bucket privado
// `documents`; aqui só gravamos a referência. Path vem do form.
export async function addExpenseAttachmentAction(fd: FormData): Promise<ExpenseAttachment> {
  await gate();
  const expenseId = str(fd, "expense_id");
  if (!expenseId) throw new Error("Missing expense reference.");
  const fileUrl = str(fd, "file_url");
  if (!fileUrl) throw new Error("Missing file.");
  const supabase = createClient();
  const { data, error } = await supabase
    .from("expense_attachments")
    .insert({
      expense_id: expenseId,
      file_url: fileUrl,
      file_name: str(fd, "file_name"),
      content_type: str(fd, "content_type"),
    })
    .select("id, expense_id, file_url, file_name, content_type, created_at")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/expenses");
  return data as ExpenseAttachment;
}

export async function deleteExpenseAttachmentAction(fd: FormData) {
  await gate();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing attachment reference.");
  const supabase = createClient();
  const { error } = await supabase.from("expense_attachments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/expenses");
}
