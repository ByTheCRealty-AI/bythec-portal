"use server";

// =============================================================================
// /applications — ações internas (owner + manager · cap applications.manage).
// =============================================================================
// O RLS reforça no banco (policy rental_apps_manage). Aqui guardamos a UI +
// defesa em profundidade. SSN só é decifrado sob demanda, gated + auditado.
// =============================================================================

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { decryptSensitive } from "@/lib/crypto-ssn";
import type { ApplicationStatus } from "@/lib/types";

async function gate() {
  const profile = await getProfile();
  if (!can(profile, "applications.manage")) {
    throw new Error("You do not have permission to view rental applications.");
  }
  return profile!;
}

const VALID: ApplicationStatus[] = ["new", "reviewing", "approved", "denied", "withdrawn"];

export async function setApplicationStatusAction(id: string, status: ApplicationStatus) {
  const profile = await gate();
  if (!id) throw new Error("Missing application reference.");
  if (!VALID.includes(status)) throw new Error("Invalid status.");
  const supabase = createClient();
  const { error } = await supabase
    .from("rental_applications")
    .update({ status, reviewed_by: profile.id })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/applications");
}

export async function setApplicationNotesAction(id: string, notes: string) {
  await gate();
  if (!id) throw new Error("Missing application reference.");
  const supabase = createClient();
  const { error } = await supabase
    .from("rental_applications")
    .update({ internal_notes: notes.trim() || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/applications");
}

export async function archiveApplicationAction(id: string) {
  await gate();
  if (!id) throw new Error("Missing application reference.");
  const supabase = createClient();
  const { error } = await supabase
    .from("rental_applications")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/applications");
}

// Assina uma URL temporária pra ver uma foto/arquivo de government ID. Gated.
// A leitura acontece server-side (RLS do storage não expõe o bucket ao público).
export async function signAttachmentUrl(filePath: string): Promise<string> {
  await gate();
  if (!filePath) throw new Error("Missing file reference.");
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("documents")
    .createSignedUrl(filePath, 60 * 5); // 5 min
  if (error || !data?.signedUrl) throw new Error(error?.message || "Could not open file.");
  return data.signedUrl;
}

// Decifra o SSN/ITIN sob demanda. Gated + registra QUEM e QUANDO revelou
// (trilha de auditoria). Retorna o valor em claro só nesta resposta.
export async function revealSSNAction(id: string): Promise<string> {
  const profile = await gate();
  if (!id) throw new Error("Missing application reference.");
  const supabase = createClient();
  const { data, error } = await supabase
    .from("rental_applications")
    .select("ssn_encrypted")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const blob = (data?.ssn_encrypted as string | null) ?? null;
  if (!blob) throw new Error("No SSN on file for this application.");

  let plain: string;
  try {
    plain = decryptSensitive(blob);
  } catch {
    throw new Error("Could not decrypt — the encryption key may be missing or wrong.");
  }

  // Auditoria: marca quem revelou e quando (não bloqueia o retorno se falhar).
  await supabase
    .from("rental_applications")
    .update({ ssn_last_revealed_at: new Date().toISOString(), ssn_last_revealed_by: profile.id })
    .eq("id", id);

  revalidatePath("/applications");
  return plain;
}
