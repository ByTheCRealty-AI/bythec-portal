"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PropertyType, RequestStatus } from "@/lib/types";
import { getProfile } from "@/lib/auth/session";
import { canDelete, can, canReorderDocuments } from "@/lib/auth/capabilities";
import { generateMonthlyPaymentsAction } from "../payments/actions";

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
// Seasonal commission % (input em %) -> fração. Default 0.10 se vazio/inválido.
function seasonalRate(fd: FormData): number {
  const pct = num(fd, "seasonal_commission_pct");
  if (pct === null || !Number.isFinite(pct)) return 0.1;
  return pct / 100;
}
// Base do % seasonal. Default 'host_payout' (maioria das casas).
function seasonalBase(fd: FormData): "host_payout" | "paid_by_guest" {
  return str(fd, "seasonal_commission_base") === "paid_by_guest" ? "paid_by_guest" : "host_payout";
}

// Cria propriedade direto da tela /propriedades/novo. O owner_id vem do picker
// do formulário (entidade-mãe obrigatória). Espelha createPropriedadeAction do
// fluxo do cliente, mas standalone.
export async function createPropriedadeStandaloneAction(fd: FormData) {
  const supabase = createClient();
  const profile = await getProfile();
  const ownerId = str(fd, "owner_id");
  if (!ownerId) throw new Error("An owner is required to create a property.");
  const address = str(fd, "address");
  const { data, error } = await supabase
    .from("properties")
    .insert({
      owner_id: ownerId, // TRAVADO: toda propriedade tem dono.
      created_by: profile?.id ?? null, // proveniência (realtor scope, migration 0021)
      address,
      address2: str(fd, "address2"),
      address_text: address ? address.toLowerCase() : null,
      property_type: str(fd, "property_type") as PropertyType,
      commission_fee: num(fd, "commission_fee"),
      seasonal_commission_rate: seasonalRate(fd),
      seasonal_commission_base: seasonalBase(fd),
      rent_price: num(fd, "rent_price"),
      rent_due_day: num(fd, "rent_due_day"),
      rent_frequency: str(fd, "rent_frequency"),
      rental_start: str(fd, "rental_start"),
      rental_end: str(fd, "rental_end"),
      rent_collection: str(fd, "rent_collection") === "owner" ? "owner" : "bythec",
      notes: str(fd, "notes"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/propriedades");
  revalidatePath(`/clientes/${ownerId}`);
  redirect(`/propriedades/${data.id}`);
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
      seasonal_commission_rate: seasonalRate(fd),
      seasonal_commission_base: seasonalBase(fd),
      rent_price: num(fd, "rent_price"),
      rent_due_day: num(fd, "rent_due_day"),
      rent_frequency: str(fd, "rent_frequency"),
      rental_start: str(fd, "rental_start"),
      rental_end: str(fd, "rental_end"),
      rent_collection: str(fd, "rent_collection") === "owner" ? "owner" : "bythec",
      notes: str(fd, "notes"),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${id}`);
  revalidatePath("/propriedades");
  redirect(`/propriedades/${id}`);
}

// Nova locação: define/troca o inquilino de um aluguel (year-round/off-season) e
// grava as datas do contrato num passo só. O inquilino pode ser um cliente
// existente (tenant_id) ou novo (cria o client com o tipo certo). Opcional:
// gerar os pagamentos mensais do novo contrato e arquivar o inquilino anterior.
// O histórico do inquilino antigo (pagamentos) NÃO é alterado — só desliga o
// vínculo com a propriedade. Só properties.edit.
export async function assignTenancyAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit")) {
    throw new Error("You do not have permission to change the tenant.");
  }
  const supabase = createClient();

  const propertyId = str(fd, "property_id");
  if (!propertyId) throw new Error("A property is required.");

  const { data: prop, error: propErr } = await supabase
    .from("properties")
    .select("id, tenant_id, property_type")
    .eq("id", propertyId)
    .maybeSingle();
  if (propErr) throw new Error(propErr.message);
  if (!prop) throw new Error("That property could not be found.");
  const p = prop as { id: string; tenant_id: string | null; property_type: PropertyType };
  const previousTenantId = p.tenant_id;

  // Novo inquilino: existente (tenant_id) OU novo cliente (cria o client).
  let newTenantId: string | null;
  if (str(fd, "tenant_mode") === "new") {
    const name = str(fd, "new_name");
    if (!name) throw new Error("Enter the new tenant's name.");
    const clientType =
      p.property_type === "off_season_rental" ? "off_season_tenant" : "tenant";
    const { data: created, error: cErr } = await supabase
      .from("clients")
      .insert({
        name,
        email: str(fd, "new_email"),
        phone: str(fd, "new_phone"),
        client_type: clientType,
      })
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);
    newTenantId = created.id as string;
  } else {
    newTenantId = str(fd, "tenant_id");
    if (!newTenantId) throw new Error("Pick a client to set as the tenant.");
  }

  // Atualiza a propriedade: inquilino + datas/valor do contrato.
  const { error: upErr } = await supabase
    .from("properties")
    .update({
      tenant_id: newTenantId,
      rent_price: num(fd, "rent_price"),
      rent_due_day: num(fd, "rent_due_day"),
      rental_start: str(fd, "rental_start"),
      rental_end: str(fd, "rental_end"),
    })
    .eq("id", propertyId);
  if (upErr) throw new Error(upErr.message);

  // Arquivar o inquilino anterior (opcional) — só se havia um e é diferente do novo.
  if (str(fd, "archive_old") === "1" && previousTenantId && previousTenantId !== newTenantId) {
    const { error: arErr } = await supabase
      .from("clients")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", previousTenantId);
    if (arErr) throw new Error(arErr.message);
  }

  // Gerar os pagamentos mensais do novo contrato (opcional). Idempotente: pula
  // meses que já têm pagamento monthly.
  if (str(fd, "generate_payments") === "1") {
    await generateMonthlyPaymentsAction(propertyId);
  }

  revalidatePath(`/propriedades/${propertyId}`);
  revalidatePath("/propriedades");
  revalidatePath("/payments");
}

// Deixa a propriedade vaga (remove o inquilino). Não mexe no histórico.
export async function clearPropertyTenantAction(propertyId: string) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit")) {
    throw new Error("You do not have permission to change the tenant.");
  }
  if (!propertyId) throw new Error("A property is required.");
  const supabase = createClient();
  const { error } = await supabase
    .from("properties")
    .update({ tenant_id: null })
    .eq("id", propertyId);
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${propertyId}`);
  revalidatePath("/propriedades");
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

// HARD DELETE (permanente, irreversível) — OWNER ONLY. Delega TODA a regra
// (papel owner + precisa estar arquivada + cascade seguro) pra RPC server-side
// admin_delete_property, que dá raise exception com mensagem humana. Aqui só:
//  1) re-checa owner no servidor (defesa em profundidade; o banco também checa).
//  2) chama a RPC e propaga a mensagem do banco pro modal (não engole o erro).
//  3) em caso de sucesso, revalida e redireciona pra lista.
export async function deletePropriedadeAction(id: string) {
  const profile = await getProfile();
  if (!canDelete(profile)) {
    throw new Error("Only the owner can permanently delete records.");
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_delete_property", { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/propriedades");
  redirect("/propriedades");
}

// ---- Inline adds from the property detail tabs -----------------------------
// Todas re-checam a capacidade no servidor (defesa em profundidade; o RLS
// reforça de verdade no banco) e revalidam a rota do detalhe pra a nova linha
// aparecer na hora, sem redirect (o usuário continua na mesma aba).

// Hoje em YYYY-MM-DD (string "date" do Postgres), default de campos de data.
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Nota presa à propriedade (parent_type='property'). body obrigatório; year
// opcional cai no ano corrente. Gate: properties.edit.
export async function addPropertyNoteAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit")) {
    throw new Error("You do not have permission to add notes to properties.");
  }
  const propertyId = str(fd, "parent_id");
  if (!propertyId) throw new Error("Missing property reference.");
  const body = str(fd, "body");
  if (!body) throw new Error("The note cannot be empty.");
  const year = num(fd, "year") ?? new Date().getFullYear();

  const supabase = createClient();
  const { error } = await supabase.from("notes").insert({
    parent_type: "property",
    parent_id: propertyId,
    body,
    year,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${propertyId}`);
}

// Serviço registrado na propriedade. description obrigatória; date default hoje;
// status default 'open'; price e provider opcionais. Gate: operations.edit.
export async function addServiceAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "operations.edit")) {
    throw new Error("You do not have permission to record services.");
  }
  const propertyId = str(fd, "property_id");
  if (!propertyId) throw new Error("Missing property reference.");
  const description = str(fd, "description");
  if (!description) throw new Error("A description is required.");
  const status = (str(fd, "status") === "done" ? "done" : "open") as RequestStatus;

  const supabase = createClient();
  const { error } = await supabase.from("services").insert({
    property_id: propertyId,
    service_request_date: str(fd, "service_request_date") ?? today(),
    description,
    status,
    price: num(fd, "price"),
    provider_id: str(fd, "provider_id"),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${propertyId}`);
}

// "Belongs to": resolve the form choice to tenant_id / tenant_label. Only ONE is
// ever set. Shared by add + edit-tenancy so the rules live in one place.
//  - property       -> both null (default)
//  - current        -> the property's CURRENT tenant, looked up on the SERVER
//                      (never trusted from the client)
//  - past_existing  -> a chosen client (may be archived); validated to exist
//  - past_free      -> free-text name (+ optional years), not a client
async function resolveBelongsTo(
  supabase: ReturnType<typeof createClient>,
  propertyId: string,
  fd: FormData
): Promise<{ tenantId: string | null; tenantLabel: string | null }> {
  const belongsTo = str(fd, "belongs_to") ?? "property";
  if (belongsTo === "current") {
    const { data: prop, error: pErr } = await supabase
      .from("properties")
      .select("tenant_id")
      .eq("id", propertyId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    const tenantId = (prop as { tenant_id: string | null } | null)?.tenant_id ?? null;
    if (!tenantId) throw new Error("This property has no current tenant to attach the document to.");
    return { tenantId, tenantLabel: null };
  }
  if (belongsTo === "past_existing") {
    const chosen = str(fd, "tenant_id");
    if (!chosen) throw new Error("Pick a past tenant, or choose a different option.");
    const { data: cli, error: cErr } = await supabase
      .from("clients")
      .select("id")
      .eq("id", chosen)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cli) throw new Error("That client could not be found.");
    return { tenantId: chosen, tenantLabel: null };
  }
  if (belongsTo === "past_free") {
    const name = str(fd, "tenant_label");
    if (!name) throw new Error("Enter the past tenant's name, or choose a different option.");
    const years = str(fd, "tenant_years");
    return { tenantId: null, tenantLabel: years ? `${name} · ${years}` : name };
  }
  return { tenantId: null, tenantLabel: null }; // property-level
}

// Documento preso à propriedade (parent_type='property'). O ARQUIVO já foi
// subido no browser (Storage RLS com a sessão do usuário); aqui só gravamos a
// linha em public.documents com o object PATH (bucket é privado — nunca URL
// pública). Gate: properties.edit OU operations.edit (RLS reforça no banco).
export async function addDocumentAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit") && !can(profile, "operations.edit")) {
    throw new Error("You do not have permission to add documents to properties.");
  }
  const propertyId = str(fd, "parent_id");
  if (!propertyId) throw new Error("Missing property reference.");
  const fileUrl = str(fd, "file_url");
  if (!fileUrl) throw new Error("Missing uploaded file reference.");
  const fileName = str(fd, "file_name") ?? "file";
  const year = num(fd, "year") ?? new Date().getFullYear();

  const supabase = createClient();
  const { tenantId, tenantLabel } = await resolveBelongsTo(supabase, propertyId, fd);

  const { error } = await supabase.from("documents").insert({
    parent_type: "property",
    parent_id: propertyId,
    file_url: fileUrl,
    file_name: fileName,
    content_type: str(fd, "content_type"),
    year,
    tenant_id: tenantId,
    tenant_label: tenantLabel,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${propertyId}`);
}

// Re-tag an EXISTING property document's "belongs to" (property / current tenant /
// past tenant). Used to fix docs that came in untagged or mis-filed (e.g. a mass
// import). Same gate as add; RLS reforça no banco. Only touches tenant_id/tenant_label.
export async function updateDocumentTenancyAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit") && !can(profile, "operations.edit")) {
    throw new Error("You do not have permission to edit documents on properties.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing document reference.");
  const propertyId = str(fd, "parent_id");
  if (!propertyId) throw new Error("Missing property reference.");

  const supabase = createClient();
  const { tenantId, tenantLabel } = await resolveBelongsTo(supabase, propertyId, fd);

  const { error } = await supabase
    .from("documents")
    .update({ tenant_id: tenantId, tenant_label: tenantLabel })
    .eq("id", id)
    .eq("parent_type", "property");
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${propertyId}`);
}

// Tenant request da propriedade. description obrigatória; date default hoje;
// status default 'open'. tenant_id é preenchido automaticamente com o inquilino
// atual da propriedade (passado num hidden field pela página). Gate: operations.edit.
export async function addRequestAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "operations.edit")) {
    throw new Error("You do not have permission to add tenant requests.");
  }
  const propertyId = str(fd, "property_id");
  if (!propertyId) throw new Error("Missing property reference.");
  const description = str(fd, "description");
  if (!description) throw new Error("A description is required.");
  const status = (str(fd, "status") === "done" ? "done" : "open") as RequestStatus;

  const supabase = createClient();
  const { error } = await supabase.from("tenant_requests").insert({
    property_id: propertyId,
    tenant_id: str(fd, "tenant_id"), // inquilino atual (auto, via hidden field); null se vago
    date: str(fd, "date") ?? today(),
    description,
    status,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${propertyId}`);
}

// ---- Inline edit + delete from the property detail tabs --------------------
// Espelham as adds: re-checam a MESMA capacidade da add no servidor (defesa em
// profundidade; o RLS reforça no banco), fazem HARD DELETE / UPDATE pelo id e
// revalidam a rota do detalhe (sem redirect — o usuário continua na aba).

// --- Notes (property) · gate: properties.edit ---
export async function updatePropertyNoteAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit")) {
    throw new Error("You do not have permission to edit notes on properties.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing note reference.");
  const propertyId = str(fd, "parent_id");
  if (!propertyId) throw new Error("Missing property reference.");
  const body = str(fd, "body");
  if (!body) throw new Error("The note cannot be empty.");
  const year = num(fd, "year") ?? new Date().getFullYear();

  const supabase = createClient();
  const { error } = await supabase
    .from("notes")
    .update({ body, year })
    .eq("id", id)
    .eq("parent_type", "property");
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${propertyId}`);
}

export async function deletePropertyNoteAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit")) {
    throw new Error("You do not have permission to delete notes on properties.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing note reference.");
  const propertyId = str(fd, "parent_id");
  if (!propertyId) throw new Error("Missing property reference.");

  const supabase = createClient();
  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", id)
    .eq("parent_type", "property");
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${propertyId}`);
}

// --- Services · gate: operations.edit ---
export async function updateServiceAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "operations.edit")) {
    throw new Error("You do not have permission to edit services.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing service reference.");
  const propertyId = str(fd, "property_id");
  if (!propertyId) throw new Error("Missing property reference.");
  const description = str(fd, "description");
  if (!description) throw new Error("A description is required.");
  const status = (str(fd, "status") === "done" ? "done" : "open") as RequestStatus;

  const supabase = createClient();
  const { error } = await supabase
    .from("services")
    .update({
      service_request_date: str(fd, "service_request_date") ?? today(),
      description,
      status,
      price: num(fd, "price"),
      provider_id: str(fd, "provider_id"),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${propertyId}`);
  revalidatePath("/services"); // aba global de Services
}

export async function deleteServiceAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "operations.edit")) {
    throw new Error("You do not have permission to delete services.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing service reference.");
  const propertyId = str(fd, "property_id");
  if (!propertyId) throw new Error("Missing property reference.");

  const supabase = createClient();
  const { error } = await supabase.from("services").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${propertyId}`);
  revalidatePath("/services"); // aba global de Services
}

// --- Tenant requests · gate: operations.edit ---
export async function updateRequestAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "operations.edit")) {
    throw new Error("You do not have permission to edit tenant requests.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing request reference.");
  const propertyId = str(fd, "property_id");
  if (!propertyId) throw new Error("Missing property reference.");
  const description = str(fd, "description");
  if (!description) throw new Error("A description is required.");
  const status = (str(fd, "status") === "done" ? "done" : "open") as RequestStatus;

  const supabase = createClient();
  const { error } = await supabase
    .from("tenant_requests")
    .update({
      date: str(fd, "date") ?? today(),
      description,
      status,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${propertyId}`);
}

export async function deleteRequestAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "operations.edit")) {
    throw new Error("You do not have permission to delete tenant requests.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing request reference.");
  const propertyId = str(fd, "property_id");
  if (!propertyId) throw new Error("Missing property reference.");

  const supabase = createClient();
  const { error } = await supabase.from("tenant_requests").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${propertyId}`);
}

// --- Documents (property) · gate: properties.edit OU operations.edit ---
// HARD DELETE: remove o OBJECT do Storage e DEPOIS apaga a linha. Se a remoção
// do storage falhar, paramos (não deixa órfão de linha apontando pra arquivo).
export async function deletePropertyDocumentAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit") && !can(profile, "operations.edit")) {
    throw new Error("You do not have permission to delete documents on properties.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing document reference.");
  const propertyId = str(fd, "parent_id");
  if (!propertyId) throw new Error("Missing property reference.");
  const fileUrl = str(fd, "file_url");
  if (!fileUrl) throw new Error("Missing file reference.");

  const supabase = createClient();
  const { error: storageError } = await supabase.storage.from("documents").remove([fileUrl]);
  if (storageError) throw new Error(`Could not remove the file: ${storageError.message}`);
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("parent_type", "property");
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${propertyId}`);
}

// ---- Bulk import (OneDrive -> portal) --------------------------------------
// The files are uploaded CLIENT-SIDE (browser, user's session → Storage RLS)
// before this runs; here we only INSERT the documents rows for a whole batch.
// Idempotent: skips any file whose source_path is already imported for this
// property (so a re-run never double-inserts). Gate: properties.edit OR
// operations.edit (RLS reforça no banco).
type ImportDocInput = {
  file_url: string;
  file_name: string;
  content_type: string | null;
  doc_date: string | null; // YYYY-MM-DD
  source_path: string; // original OneDrive relative path (provenance + idempotency)
  belongs_to: "property" | "current" | "past_existing" | "past_free";
  tenant_id?: string | null;
  tenant_label?: string | null;
};

export async function importPropertyDocumentsAction(
  propertyId: string,
  docs: ImportDocInput[]
): Promise<{ inserted: number; skipped: number }> {
  const profile = await getProfile();
  if (!can(profile, "properties.edit") && !can(profile, "operations.edit")) {
    throw new Error("You do not have permission to import documents.");
  }
  if (!propertyId) throw new Error("Missing property reference.");
  if (!Array.isArray(docs) || docs.length === 0) return { inserted: 0, skipped: 0 };

  const supabase = createClient();

  // Current tenant resolved ONCE on the server (never trusted from the client).
  const { data: prop, error: pErr } = await supabase
    .from("properties")
    .select("tenant_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  const currentTenantId = (prop as { tenant_id: string | null } | null)?.tenant_id ?? null;

  // Idempotency: which source_paths are already imported for this property.
  const { data: existing } = await supabase
    .from("documents")
    .select("source_path")
    .eq("parent_type", "property")
    .eq("parent_id", propertyId)
    .not("source_path", "is", null);
  const seen = new Set(
    ((existing ?? []) as { source_path: string | null }[]).map((r) => r.source_path)
  );

  // Validate the client ids referenced by past_existing (active OR archived).
  const tenantIds = Array.from(
    new Set(
      docs
        .filter((d) => d.belongs_to === "past_existing" && d.tenant_id)
        .map((d) => d.tenant_id as string)
    )
  );
  const validTenant = new Set<string>();
  if (tenantIds.length > 0) {
    const { data: cli, error: cErr } = await supabase
      .from("clients")
      .select("id")
      .in("id", tenantIds);
    if (cErr) throw new Error(cErr.message);
    for (const c of (cli ?? []) as { id: string }[]) validTenant.add(c.id);
  }

  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const d of docs) {
    if (!d.file_url || !d.source_path) { skipped++; continue; }
    if (seen.has(d.source_path)) { skipped++; continue; }
    let tenant_id: string | null = null;
    let tenant_label: string | null = null;
    if (d.belongs_to === "current") {
      tenant_id = currentTenantId; // may be null (vacant) -> property-level
    } else if (d.belongs_to === "past_existing") {
      if (d.tenant_id && validTenant.has(d.tenant_id)) tenant_id = d.tenant_id;
      else { skipped++; continue; } // referenced a client that doesn't exist
    } else if (d.belongs_to === "past_free") {
      tenant_label = (d.tenant_label ?? "").trim() || null;
    }
    rows.push({
      parent_type: "property",
      parent_id: propertyId,
      file_url: d.file_url,
      file_name: d.file_name,
      content_type: d.content_type,
      doc_date: d.doc_date,
      source_path: d.source_path,
      tenant_id,
      tenant_label,
    });
    seen.add(d.source_path);
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("documents").insert(rows);
    if (error) throw new Error(error.message);
  }
  revalidatePath(`/propriedades/${propertyId}`);
  return { inserted: rows.length, skipped };
}

// Renomeia o NOME EXIBIDO de um documento (coluna file_name). NÃO mexe no arquivo
// no Storage (file_url/object path continua o mesmo) — é só o rótulo mostrado no
// portal. Gate: properties.edit OR operations.edit (RLS reforça no banco).
export async function renameDocumentAction(fd: FormData) {
  const profile = await getProfile();
  if (!can(profile, "properties.edit") && !can(profile, "operations.edit")) {
    throw new Error("You do not have permission to rename documents.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing document reference.");
  const propertyId = str(fd, "parent_id");
  if (!propertyId) throw new Error("Missing property reference.");
  const fileName = str(fd, "file_name");
  if (!fileName) throw new Error("The document name cannot be empty.");

  const supabase = createClient();
  const { error } = await supabase
    .from("documents")
    .update({ file_name: fileName })
    .eq("id", id)
    .eq("parent_type", "property");
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${propertyId}`);
}

// ---- Manual document ordering (owner + manager only) ------------------------
// Persiste a ordem escolhida à mão: sort_order = posição (0,1,2…) na lista dada.
// `orderedIds` = os documentos de UMA seção (current / property / um past tenant)
// na ordem final. Só toca sort_order; grava em paralelo. Gate por PAPEL
// (owner/manager) — a secretária tem properties.edit mas NÃO reordena.
export async function reorderDocumentsAction(propertyId: string, orderedIds: string[]) {
  const profile = await getProfile();
  if (!canReorderDocuments(profile)) {
    throw new Error("Only the owner and manager can reorder documents.");
  }
  if (!propertyId) throw new Error("Missing property reference.");
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;

  const supabase = createClient();
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      supabase
        .from("documents")
        .update({ sort_order: i })
        .eq("id", id)
        .eq("parent_type", "property")
        .eq("parent_id", propertyId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  revalidatePath(`/propriedades/${propertyId}`);
}
