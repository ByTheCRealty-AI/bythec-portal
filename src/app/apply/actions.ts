"use server";

// =============================================================================
// /apply — server actions PÚBLICAS (candidato SEM login)
// =============================================================================
// SEGURANÇA:
//  - Insert entra pelo service-role (admin.ts) que BYPASSA o RLS — a tabela
//    rental_applications não tem policy pra anon de propósito.
//  - O pagamento Stripe é RE-VALIDADO aqui no servidor (nunca confiando no
//    cliente) ANTES de gravar: status succeeded, valor $50, moeda usd, e o
//    PaymentIntent não pode ter sido usado por outra aplicação (coluna UNIQUE).
//  - SSN é cifrado (AES-256-GCM) server-side; guardamos só ssn_last4 em claro.
//  - Uploads de government ID entram por signed upload URL (mintada pelo service
//    role) direto pro bucket privado `documents` — os bytes NÃO passam pela
//    server action (evita limite de body). Só a referência é gravada.
// =============================================================================

import crypto from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, APPLICATION_FEE_CENTS } from "@/lib/stripe";
import { encryptSensitive, last4 } from "@/lib/crypto-ssn";
import type { ApplicationInput } from "./types";

const BUCKET = "documents";
const PREFIX = "rental-applications";

function clean(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t === "" ? null : t;
}

// -----------------------------------------------------------------------------
// 0) Signed upload URL pra uma foto/arquivo de government ID. Público.
//    Devolve { path, token } — o cliente sobe direto pro storage com
//    uploadToSignedUrl(path, token, file). Bucket privado; ninguém lê sem gate.
// -----------------------------------------------------------------------------
export async function createIdUploadUrl(
  fileName: string
): Promise<{ path: string; token: string }> {
  const admin = createAdminClient();
  const safe = (fileName || "id").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "id";
  const folder = crypto.randomUUID();
  const path = `${PREFIX}/${folder}/${safe}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message || "Could not create upload URL.");
  return { path: data.path, token: data.token };
}

// -----------------------------------------------------------------------------
// 1) Cria o PaymentIntent do fee ($50). Chamado quando o formulário monta o
//    Payment Element. Retorna só o client_secret + id (nada sensível).
// -----------------------------------------------------------------------------
export async function createApplicationPaymentIntent(): Promise<{
  clientSecret: string;
  paymentIntentId: string;
}> {
  const stripe = await getStripe();
  const pi = await stripe.paymentIntents.create({
    amount: APPLICATION_FEE_CENTS,
    currency: "usd",
    // Métodos automáticos, mas SEM redirecionar: assim o confirmPayment resolve
    // inline (sem sair da página) e o insert client-side sempre roda com o
    // PaymentIntent já em 'succeeded'. Evita métodos que exigem redirect.
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    description: "By the C — Rental application fee",
    metadata: { purpose: "rental_application" },
  });
  if (!pi.client_secret) throw new Error("Could not initialize payment.");
  return { clientSecret: pi.client_secret, paymentIntentId: pi.id };
}

// -----------------------------------------------------------------------------
// 2) Grava a aplicação — SÓ depois de re-validar o pagamento no servidor.
//    A validação COMPLETA (todos os obrigatórios) roda no cliente ANTES de
//    cobrar. Aqui reforçamos o essencial (não cobrar e não gravar = pior mundo).
// -----------------------------------------------------------------------------
export async function submitApplication(
  input: ApplicationInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const fullName = clean(input.full_name);
    if (!fullName) return { ok: false, error: "Full name is required." };
    if (!input.consent_agreed) return { ok: false, error: "Consent is required." };
    const piId = clean(input.stripe_payment_intent_id);
    if (!piId) return { ok: false, error: "Missing payment reference." };

    // ---- RE-VALIDA o pagamento no Stripe (não confia no cliente) -----------
    const stripe = await getStripe();
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (pi.status !== "succeeded") {
      return { ok: false, error: "Payment not completed. Please try again." };
    }
    if (pi.amount !== APPLICATION_FEE_CENTS || pi.currency !== "usd") {
      return { ok: false, error: "Payment amount mismatch." };
    }
    if (pi.metadata?.purpose !== "rental_application") {
      return { ok: false, error: "Invalid payment." };
    }

    const admin = createAdminClient();

    // Guard contra reuso do mesmo pagamento (além do UNIQUE no banco).
    const { data: existing } = await admin
      .from("rental_applications")
      .select("id")
      .eq("stripe_payment_intent_id", piId)
      .maybeSingle();
    if (existing) return { ok: true }; // idempotente

    // ---- SSN cifrado (só quando tem) --------------------------------------
    const ssnRaw = input.has_ssn ? clean(input.ssn) : null;
    const ssn_encrypted = ssnRaw ? encryptSensitive(ssnRaw) : null;
    const ssn_last4 = ssnRaw ? last4(ssnRaw) : null;

    const h = headers();
    const consent_ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;

    const { data: created, error } = await admin
      .from("rental_applications")
      .insert({
        language: input.language === "pt" ? "pt" : "en",
        status: "new",
        rental_type:
          input.rental_type === "year_round" || input.rental_type === "winter"
            ? input.rental_type
            : null,
        lease_start: clean(input.lease_start),
        property_id: clean(input.property_id),
        property_other: clean(input.property_other),

        full_name: fullName,
        date_of_birth: clean(input.date_of_birth),

        has_ssn: input.has_ssn,
        ssn_encrypted,
        ssn_last4,
        ssn_none_explanation: input.has_ssn ? null : clean(input.ssn_none_explanation),

        phone: clean(input.phone),

        has_license: input.has_license,
        drivers_license: input.has_license ? clean(input.drivers_license) : null,
        drivers_license_state: input.has_license ? clean(input.drivers_license_state) : null,
        gov_id_type: input.has_license ? null : (input.gov_id_type ?? null),
        gov_id_number: input.has_license ? null : clean(input.gov_id_number),

        email: clean(input.email),

        occupants_count: input.occupants_count,
        occupants: sanitizeArray(input.occupants),
        rental_history: sanitizeArray(input.rental_history),
        vehicles: sanitizeArray(input.vehicles),

        employer: clean(input.employer),
        employer_address: clean(input.employer_address),
        manager_name: clean(input.manager_name),
        manager_phone: clean(input.manager_phone),
        job_title: clean(input.job_title),
        monthly_income: input.monthly_income,
        length_of_employment: clean(input.length_of_employment),

        personal_references: sanitizeArray(input.personal_references),

        evicted: input.evicted,
        evicted_detail: clean(input.evicted_detail),
        felony: input.felony,
        felony_detail: clean(input.felony_detail),
        bankruptcy: input.bankruptcy,
        bankruptcy_detail: clean(input.bankruptcy_detail),
        smokes: input.smokes,
        has_pets: input.has_pets,
        pets_detail: clean(input.pets_detail),
        reason_for_moving: clean(input.reason_for_moving),

        consent_agreed: true,
        signature_name: clean(input.signature_name),
        signature_date: clean(input.signature_date),
        signature_name_2: clean(input.signature_name_2),
        signature_date_2: clean(input.signature_date_2),
        consent_ip,

        fee_amount: 100,
        payment_status: "paid",
        stripe_payment_intent_id: piId,
        paid_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") return { ok: true }; // corrida no UNIQUE
      return { ok: false, error: error.message };
    }

    // ---- Liga os anexos de government ID (já no storage) -------------------
    const appId = created?.id as string | undefined;
    const atts = Array.isArray(input.attachments) ? input.attachments : [];
    const rows = atts
      .filter((a) => a && typeof a.file_path === "string" && a.file_path)
      .map((a) => ({
        application_id: appId!,
        category: a.category === "occupant_id" ? "occupant_id" : "applicant_id",
        occupant_index: typeof a.occupant_index === "number" ? a.occupant_index : null,
        label: clean(a.label),
        file_path: a.file_path,
        file_name: clean(a.file_name),
        content_type: clean(a.content_type),
      }));
    if (appId && rows.length > 0) {
      const { error: attErr } = await admin
        .from("rental_application_attachments")
        .insert(rows);
      // Não derruba a aplicação (já gravada + paga) se o anexo falhar; loga.
      if (attErr) console.error("attachment link failed:", attErr.message);
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected error.",
    };
  }
}

// Remove entradas totalmente vazias e garante um array de objetos "chatos".
// Constraint `object` (não Record<string,unknown>): interfaces satisfazem
// `object` mas NÃO Record<string,unknown> (sem index signature implícita).
function sanitizeArray<T extends object>(arr: T[] | undefined): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((row) =>
    row && typeof row === "object"
      ? Object.values(row).some((v) => typeof v === "string" && v.trim() !== "")
      : false
  );
}
