"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import {
  ALL_CAPABILITIES,
  can,
  canAssignRole,
  canDeleteUsers,
  canEditTarget,
  type AppRole,
  type Capability,
  type PermissionOverrides,
  type ProfileLike,
} from "@/lib/auth/capabilities";

const VALID_ROLES: AppRole[] = [
  "owner",
  "manager",
  "secretary",
  "owner_client",
  "tenant",
  "realtor",
];

type Result = { ok: true } | { ok: false; error: string };

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function siteUrl(): string {
  // Usado no redirect do convite. Em produção configurar NEXT_PUBLIC_SITE_URL.
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL ??
    "https://bythec-portal.vercel.app"
  ).replace(/\/$/, "");
}

// ---- Convidar/criar login --------------------------------------------------
// Usa service_role (admin.ts) SÓ aqui. Checa capacidade do chamador ANTES
// (defesa em profundidade — auth.admin não passa por RLS).
export async function inviteUserAction(fd: FormData): Promise<Result> {
  const actor = await getProfile();
  if (!actor || !can(actor, "users.create")) {
    return { ok: false, error: "You do not have permission to add logins." };
  }

  const email = str(fd, "email")?.toLowerCase() ?? null;
  const fullName = str(fd, "full_name");
  const phone = str(fd, "phone");
  const addressLine1 = str(fd, "address_line1");
  const addressLine2 = str(fd, "address_line2");
  const city = str(fd, "city");
  const state = str(fd, "state");
  const zip = str(fd, "zip");
  const role = (str(fd, "role") as AppRole) ?? "secretary";

  if (!email) return { ok: false, error: "Email is required." };
  if (!VALID_ROLES.includes(role)) return { ok: false, error: "Invalid role." };
  if (!canAssignRole(actor, role)) {
    return { ok: false, error: "Only an owner can assign the Owner or Manager role." };
  }

  const admin = createAdminClient();
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    // O trigger lê estes metadados pra criar o profile com o papel certo +
    // dados pessoais. Mantemos um upsert abaixo como caminho confiável.
    data: { full_name: fullName, phone, role },
    // Implicit flow: o Supabase manda a sessão no hash pra esta URL. Apontamos
    // direto pra tela de criar senha (que é hash-aware). Se a allowlist do
    // Supabase não tiver esta URL, o GoTrue cai pra Site URL (raiz) — e aí o
    // AuthHashHandler no painel finaliza o fluxo do mesmo jeito.
    redirectTo: `${siteUrl()}/auth/set-password`,
  });

  if (error) {
    return { ok: false, error: friendlyEmailError(error.message) };
  }

  // Garantir que phone/address (e full_name) fiquem gravados no profile mesmo
  // que o trigger não leia algum campo — caminho mais confiável. O profile já
  // nasceu pelo trigger; aqui só preenchemos os campos pessoais.
  const newId = invited?.user?.id;
  if (newId) {
    await admin
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        address_line1: addressLine1,
        address_line2: addressLine2,
        city,
        state,
        zip,
      })
      .eq("id", newId);
  }

  revalidatePath("/users");
  return { ok: true };
}

// ---- Editar role / permissions / active ------------------------------------
export async function updateUserAccessAction(
  targetId: string,
  fd: FormData
): Promise<Result> {
  const actor = await getProfile();
  if (!actor || !can(actor, "users.manage_access")) {
    return { ok: false, error: "You do not have permission to edit access." };
  }

  const supabase = createClient();

  // Buscar o alvo (RLS permite ler quem o ator pode gerir).
  const { data: target } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, permissions, active")
    .eq("id", targetId)
    .maybeSingle();

  if (!target) return { ok: false, error: "User not found or not editable." };

  const targetProfile = target as ProfileLike;

  // Manager não toca em owner/manager.
  if (!canEditTarget(actor, targetProfile.role)) {
    return { ok: false, error: "You cannot edit this user." };
  }

  // Papel desejado.
  const newRole = (str(fd, "role") as AppRole) ?? targetProfile.role;
  if (!VALID_ROLES.includes(newRole)) return { ok: false, error: "Invalid role." };

  // Promover a owner/manager: só owner pode.
  if (newRole !== targetProfile.role && !canAssignRole(actor, newRole)) {
    return { ok: false, error: "Only an owner can grant the Owner or Manager role." };
  }
  // Manager não pode editar alguém PARA um papel interno fora do seu alcance,
  // nem mexer em alvo que vire owner/manager.
  if (actor.role !== "owner" && (newRole === "owner" || newRole === "manager")) {
    return { ok: false, error: "Only an owner can grant the Owner or Manager role." };
  }

  // Overrides de permissão (somente chaves válidas, valor boolean).
  const overrides: PermissionOverrides = {};
  for (const cap of ALL_CAPABILITIES) {
    const raw = fd.get(`override:${cap}`);
    // Cada toggle envia "default" | "true" | "false".
    if (raw === "true") overrides[cap as Capability] = true;
    else if (raw === "false") overrides[cap as Capability] = false;
    // "default" (ou ausente) = não grava override (segue o papel).
  }

  const active = fd.get("active") === "on" || fd.get("active") === "true";

  // Dados pessoais (livres pra editar respeitando o who-can-edit-whom acima).
  const fullName = str(fd, "full_name");
  const phone = str(fd, "phone");
  const addressLine1 = str(fd, "address_line1");
  const addressLine2 = str(fd, "address_line2");
  const city = str(fd, "city");
  const state = str(fd, "state");
  const zip = str(fd, "zip");
  const newEmail = str(fd, "email")?.toLowerCase() ?? null;

  // --- E-mail editável -------------------------------------------------------
  // Se mudou, atualizar PRIMEIRO o auth.users (service_role) e só então o
  // profiles.email. Se o Auth falhar (ex.: e-mail já em uso), aborta e mantém
  // tudo consistente.
  const emailChanged = !!newEmail && newEmail !== (targetProfile.email ?? "").toLowerCase();
  if (emailChanged) {
    const admin = createAdminClient();
    const { error: authErr } = await admin.auth.admin.updateUserById(targetId, {
      email: newEmail!,
    });
    if (authErr) return { ok: false, error: friendlyEmailError(authErr.message) };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      phone,
      address_line1: addressLine1,
      address_line2: addressLine2,
      city,
      state,
      zip,
      ...(emailChanged ? { email: newEmail } : {}),
      role: newRole,
      permissions: overrides,
      active,
    })
    .eq("id", targetId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/users");
  return { ok: true };
}

// Traduz erros comuns de e-mail do Auth em mensagem amigável (EN-US).
function friendlyEmailError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("already") && (m.includes("registered") || m.includes("exist") || m.includes("in use"))) {
    return "That email is already in use by another login.";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "That email address is not valid.";
  }
  return raw;
}

// ---- Deletar login (owner only) --------------------------------------------
export async function deleteUserAction(targetId: string): Promise<Result> {
  const actor = await getProfile();
  if (!actor || !canDeleteUsers(actor)) {
    return { ok: false, error: "Only an owner can delete logins." };
  }
  if (actor.id === targetId) {
    return { ok: false, error: "You cannot delete your own login." };
  }

  // Apaga o auth.user (cascade remove o profile via FK on delete cascade).
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(targetId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/users");
  return { ok: true };
}
