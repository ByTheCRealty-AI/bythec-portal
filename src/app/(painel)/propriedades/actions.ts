"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PropertyType, RequestStatus } from "@/lib/types";
import { getProfile } from "@/lib/auth/session";
import { canDelete, can } from "@/lib/auth/capabilities";

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
  const ownerId = str(fd, "owner_id");
  if (!ownerId) throw new Error("An owner is required to create a property.");
  const address = str(fd, "address");
  const { data, error } = await supabase
    .from("properties")
    .insert({
      owner_id: ownerId, // TRAVADO: toda propriedade tem dono.
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
  const { error } = await supabase.from("documents").insert({
    parent_type: "property",
    parent_id: propertyId,
    file_url: fileUrl,
    file_name: fileName,
    content_type: str(fd, "content_type"),
    year,
  });
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
