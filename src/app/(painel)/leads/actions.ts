"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";

// Marca um lead do site como tratado / reabre. Gated por operations.edit
// (owner + manager + secretary). RLS no banco é a trava real.
export async function setLeadHandledAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "operations.edit")) {
    throw new Error("You do not have permission to manage leads.");
  }
  const id = String(fd.get("id") ?? "").trim();
  const handled = String(fd.get("handled") ?? "") === "true";
  if (!id) throw new Error("Missing lead id.");

  const supabase = createClient();
  const { error } = await supabase.from("website_leads").update({ handled }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/leads");
  revalidatePath("/");
}
