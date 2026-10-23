"use server";

// =============================================================================
// Checklist PADRÃO da inspeção (inspection_template_items, migration 0056).
// Só owner/manager (o RLS reforça com current_app_role()). Mudanças valem só pra
// inspeções NOVAS — as existentes têm a própria cópia dos itens.
// =============================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/session";

const PATH = "/propriedades/inspection-checklist";

async function assertOwnerManager() {
  const profile = await getProfile();
  if (!profile || !profile.active || (profile.role !== "owner" && profile.role !== "manager")) {
    throw new Error("Only the owner or a manager can edit the inspection checklist.");
  }
}

export async function addTemplateItemAction(section: string, label: string): Promise<void> {
  await assertOwnerManager();
  const sec = section.trim();
  const lab = label.trim();
  if (!sec) throw new Error("Enter a section name.");
  if (!lab) throw new Error("Enter the item name.");
  const supabase = createClient();

  // Fim da seção; seção nova vai pro fim do checklist.
  const { data: last } = await supabase
    .from("inspection_template_items")
    .select("position")
    .eq("section", sec)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let position = ((last as { position: number } | null)?.position ?? -1) + 1;
  if (!last) {
    const { data: maxRow } = await supabase
      .from("inspection_template_items")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    position = ((maxRow as { position: number } | null)?.position ?? 0) + 100;
  }

  const { error } = await supabase
    .from("inspection_template_items")
    .insert({ section: sec, label: lab, position, active: true });
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}

export async function renameTemplateItemAction(id: string, label: string): Promise<void> {
  await assertOwnerManager();
  const lab = label.trim();
  if (!lab) throw new Error("The item name cannot be empty.");
  const supabase = createClient();
  const { error } = await supabase.from("inspection_template_items").update({ label: lab }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}

export async function setTemplateItemActiveAction(id: string, active: boolean): Promise<void> {
  await assertOwnerManager();
  const supabase = createClient();
  const { error } = await supabase.from("inspection_template_items").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}

// Sobe/desce um item DENTRO da seção (troca a position com o vizinho).
export async function moveTemplateItemAction(id: string, direction: "up" | "down"): Promise<void> {
  await assertOwnerManager();
  const supabase = createClient();
  const { data: cur } = await supabase
    .from("inspection_template_items")
    .select("id, section, position")
    .eq("id", id)
    .maybeSingle();
  const item = cur as { id: string; section: string; position: number } | null;
  if (!item) throw new Error("Item not found.");

  const base = supabase
    .from("inspection_template_items")
    .select("id, position")
    .eq("section", item.section);
  const { data: sib } =
    direction === "up"
      ? await base.lt("position", item.position).order("position", { ascending: false }).limit(1).maybeSingle()
      : await base.gt("position", item.position).order("position", { ascending: true }).limit(1).maybeSingle();
  const other = sib as { id: string; position: number } | null;
  if (!other) return; // já está na ponta

  const { error: e1 } = await supabase
    .from("inspection_template_items")
    .update({ position: other.position })
    .eq("id", item.id);
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await supabase
    .from("inspection_template_items")
    .update({ position: item.position })
    .eq("id", other.id);
  if (e2) throw new Error(e2.message);
  revalidatePath(PATH);
}
