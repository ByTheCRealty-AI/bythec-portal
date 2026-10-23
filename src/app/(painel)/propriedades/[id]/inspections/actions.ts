"use server";

// =============================================================================
// Server actions da INSPEÇÃO de propriedade (migration 0056).
// =============================================================================
// Gate de escrita: properties.edit OU operations.edit (o mesmo dos documents da
// propriedade — o PDF final vira um documento). O RLS reforça no banco.
// "Create service" exige operations.edit (gate do services).
//
// AUTOSAVE: a tela chama estas actions a cada mudança (resultado, nota, legenda,
// cabeçalho), então um rascunho sobrevive a fechar o celular. Toda mutação
// revalida a rota da inspeção e a da propriedade: isso também limpa o cache do
// roteador no navegador, pra quem voltar pra inspeção ver o que foi salvo.
//
// Edição só em DRAFT. Depois de finalizada, só aprovação do dono + criar service.
// =============================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import {
  DEFAULT_INSPECTED_BY,
  INSPECTION_ITEM_COLUMNS,
  INSPECTION_MEDIA_COLUMNS,
  todayNY,
  validateInspection,
  type InspectionApproval,
  type InspectionItem,
  type InspectionMedia,
  type InspectionMediaKind,
  type InspectionResult,
} from "@/lib/inspections";
import { buildInspectionPdf, loadInspectionBundle } from "@/lib/inspection-server";

type Supa = ReturnType<typeof createClient>;

async function assertCanEdit() {
  const profile = await getProfile();
  if (!can(profile, "properties.edit") && !can(profile, "operations.edit")) {
    throw new Error("You do not have permission to edit inspections.");
  }
  return profile;
}

function paths(propertyId: string, inspectionId: string) {
  revalidatePath(`/propriedades/${propertyId}`);
  revalidatePath(`/propriedades/${propertyId}/inspections/${inspectionId}`);
}

type InspectionRef = { id: string; property_id: string; status: string };

async function getInspectionRef(supabase: Supa, inspectionId: string): Promise<InspectionRef> {
  const { data, error } = await supabase
    .from("inspections")
    .select("id, property_id, status")
    .eq("id", inspectionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Inspection not found.");
  return data as unknown as InspectionRef;
}

async function getDraftRef(supabase: Supa, inspectionId: string): Promise<InspectionRef> {
  const ref = await getInspectionRef(supabase, inspectionId);
  if (ref.status !== "draft") throw new Error("This inspection is already finished.");
  return ref;
}

async function getItemRef(
  supabase: Supa,
  itemId: string
): Promise<{ item: InspectionItem; inspection: InspectionRef }> {
  const { data, error } = await supabase
    .from("inspection_items")
    .select(INSPECTION_ITEM_COLUMNS)
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Inspection item not found.");
  const item = data as unknown as InspectionItem;
  const inspection = await getInspectionRef(supabase, item.inspection_id);
  return { item, inspection };
}

// ---- Criar --------------------------------------------------------------------
// Insere a inspeção + copia os itens ATIVOS do checklist padrão. Devolve o id
// (a tela navega pra inspeção).
export async function createInspectionAction(propertyId: string): Promise<{ id: string }> {
  const profile = await assertCanEdit();
  if (!propertyId) throw new Error("Missing property reference.");
  const supabase = createClient();

  const { data: tpl, error: tErr } = await supabase
    .from("inspection_template_items")
    .select("section, label, position")
    .eq("active", true)
    .order("position", { ascending: true });
  if (tErr) throw new Error(tErr.message);

  const { data: insp, error } = await supabase
    .from("inspections")
    .insert({
      property_id: propertyId,
      inspected_on: todayNY(),
      inspected_by: DEFAULT_INSPECTED_BY,
      status: "draft",
      created_by: profile?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !insp) throw new Error(error?.message ?? "Could not create the inspection.");
  const id = (insp as { id: string }).id;

  const rows = ((tpl ?? []) as { section: string; label: string; position: number }[]).map((t) => ({
    inspection_id: id,
    section: t.section,
    label: t.label,
    position: t.position,
  }));
  if (rows.length > 0) {
    const { error: iErr } = await supabase.from("inspection_items").insert(rows);
    if (iErr) throw new Error(iErr.message);
  }

  paths(propertyId, id);
  return { id };
}

// ---- Cabeçalho / textos ---------------------------------------------------------
export async function updateInspectionFieldsAction(
  inspectionId: string,
  patch: {
    inspected_on?: string;
    inspected_by?: string;
    notes?: string;
    recommendations?: string;
  }
): Promise<void> {
  await assertCanEdit();
  const supabase = createClient();
  const ref = await getDraftRef(supabase, inspectionId);

  const update: Record<string, string | null> = {};
  if (patch.inspected_on !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.inspected_on)) throw new Error("Enter a valid inspection date.");
    update.inspected_on = patch.inspected_on;
  }
  if (patch.inspected_by !== undefined) update.inspected_by = patch.inspected_by.trim() || null;
  if (patch.notes !== undefined) update.notes = patch.notes.trim() === "" ? null : patch.notes;
  if (patch.recommendations !== undefined)
    update.recommendations = patch.recommendations.trim() === "" ? null : patch.recommendations;
  if (Object.keys(update).length === 0) return;

  const { error } = await supabase.from("inspections").update(update).eq("id", inspectionId);
  if (error) throw new Error(error.message);
  paths(ref.property_id, ref.id);
}

// ---- Itens ----------------------------------------------------------------------
export async function setItemResultAction(itemId: string, result: InspectionResult | null): Promise<void> {
  await assertCanEdit();
  if (result !== null && result !== "good" && result !== "attention" && result !== "na") {
    throw new Error("Invalid answer.");
  }
  const supabase = createClient();
  const { inspection } = await getItemRef(supabase, itemId);
  if (inspection.status !== "draft") throw new Error("This inspection is already finished.");
  const { error } = await supabase.from("inspection_items").update({ result }).eq("id", itemId);
  if (error) throw new Error(error.message);
  paths(inspection.property_id, inspection.id);
}

export async function setItemNoteAction(itemId: string, note: string): Promise<void> {
  await assertCanEdit();
  const supabase = createClient();
  const { inspection } = await getItemRef(supabase, itemId);
  if (inspection.status !== "draft") throw new Error("This inspection is already finished.");
  const { error } = await supabase
    .from("inspection_items")
    .update({ note: note.trim() === "" ? null : note })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
  paths(inspection.property_id, inspection.id);
}

// Item extra só desta inspeção ("Add item to <section>"). Entra no fim da seção.
export async function addInspectionItemAction(
  inspectionId: string,
  section: string,
  label: string
): Promise<InspectionItem> {
  await assertCanEdit();
  const sec = section.trim();
  const lab = label.trim();
  if (!sec) throw new Error("Missing section.");
  if (!lab) throw new Error("Give the new item a name.");
  const supabase = createClient();
  const ref = await getDraftRef(supabase, inspectionId);

  const { data: last } = await supabase
    .from("inspection_items")
    .select("position")
    .eq("inspection_id", inspectionId)
    .eq("section", sec)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let position = ((last as { position: number } | null)?.position ?? -1) + 1;
  if (!last) {
    // Seção nova: vai pro fim da inspeção.
    const { data: maxRow } = await supabase
      .from("inspection_items")
      .select("position")
      .eq("inspection_id", inspectionId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    position = ((maxRow as { position: number } | null)?.position ?? 0) + 100;
  }

  const { data, error } = await supabase
    .from("inspection_items")
    .insert({ inspection_id: inspectionId, section: sec, label: lab, position })
    .select(INSPECTION_ITEM_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not add the item.");
  paths(ref.property_id, ref.id);
  return data as unknown as InspectionItem;
}

// Remove um item (e as fotos/vídeos dele) de um RASCUNHO.
export async function deleteInspectionItemAction(itemId: string): Promise<void> {
  await assertCanEdit();
  const supabase = createClient();
  const { inspection } = await getItemRef(supabase, itemId);
  if (inspection.status !== "draft") throw new Error("This inspection is already finished.");

  const { data: med } = await supabase.from("inspection_media").select("storage_path").eq("item_id", itemId);
  const toRemove = ((med ?? []) as { storage_path: string }[]).map((m) => m.storage_path);
  if (toRemove.length > 0) {
    const { error: sErr } = await supabase.storage.from("documents").remove(toRemove);
    if (sErr) throw new Error(`Could not remove the files: ${sErr.message}`);
  }
  const { error } = await supabase.from("inspection_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  paths(inspection.property_id, inspection.id);
}

// ---- Mídia ----------------------------------------------------------------------
// URL assinada de upload (bucket PRIVADO `documents`, prefixo da inspeção). O
// caminho é montado AQUI no servidor; o navegador só sobe o arquivo.
export async function getInspectionUploadUrlAction(
  inspectionId: string,
  ext: string
): Promise<{ path: string; token: string }> {
  await assertCanEdit();
  const supabase = createClient();
  await getDraftRef(supabase, inspectionId);
  const safeExt = /^[a-z0-9]{1,5}$/.test(ext.toLowerCase()) ? ext.toLowerCase() : "bin";
  const path = `inspections/${inspectionId}/${crypto.randomUUID()}.${safeExt}`;
  const { data, error } = await supabase.storage.from("documents").createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "Could not prepare the upload.");
  return { path: data.path, token: data.token };
}

// Grava a linha da mídia depois do upload. Devolve a linha + URL assinada pra
// miniatura.
export async function addInspectionMediaAction(input: {
  inspectionId: string;
  itemId: string | null;
  path: string;
  kind: InspectionMediaKind;
}): Promise<{ media: InspectionMedia; url: string | null }> {
  await assertCanEdit();
  const supabase = createClient();
  const ref = await getDraftRef(supabase, input.inspectionId);
  if (!input.path.startsWith(`inspections/${input.inspectionId}/`)) {
    throw new Error("Invalid file reference.");
  }
  if (input.kind !== "photo" && input.kind !== "video") throw new Error("Invalid file type.");
  if (input.itemId) {
    const { data: it } = await supabase
      .from("inspection_items")
      .select("id")
      .eq("id", input.itemId)
      .eq("inspection_id", input.inspectionId)
      .maybeSingle();
    if (!it) throw new Error("Inspection item not found.");
  }

  const { count } = await supabase
    .from("inspection_media")
    .select("id", { count: "exact", head: true })
    .eq("inspection_id", input.inspectionId);

  const { data, error } = await supabase
    .from("inspection_media")
    .insert({
      inspection_id: input.inspectionId,
      item_id: input.itemId,
      storage_path: input.path,
      kind: input.kind,
      caption: "",
      position: count ?? 0,
    })
    .select(INSPECTION_MEDIA_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save the file.");

  const { data: signed } = await supabase.storage.from("documents").createSignedUrl(input.path, 60 * 60);
  paths(ref.property_id, ref.id);
  return { media: data as unknown as InspectionMedia, url: signed?.signedUrl ?? null };
}

async function getMediaRef(supabase: Supa, mediaId: string) {
  const { data, error } = await supabase
    .from("inspection_media")
    .select("id, inspection_id, storage_path")
    .eq("id", mediaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("File not found.");
  const media = data as unknown as { id: string; inspection_id: string; storage_path: string };
  const inspection = await getDraftRef(supabase, media.inspection_id);
  return { media, inspection };
}

export async function setMediaCaptionAction(mediaId: string, caption: string): Promise<void> {
  await assertCanEdit();
  const supabase = createClient();
  const { inspection } = await getMediaRef(supabase, mediaId);
  const { error } = await supabase
    .from("inspection_media")
    .update({ caption: caption.trim() })
    .eq("id", mediaId);
  if (error) throw new Error(error.message);
  paths(inspection.property_id, inspection.id);
}

export async function deleteInspectionMediaAction(mediaId: string): Promise<void> {
  await assertCanEdit();
  const supabase = createClient();
  const { media, inspection } = await getMediaRef(supabase, mediaId);
  const { error: sErr } = await supabase.storage.from("documents").remove([media.storage_path]);
  if (sErr) throw new Error(`Could not remove the file: ${sErr.message}`);
  const { error } = await supabase.from("inspection_media").delete().eq("id", mediaId);
  if (error) throw new Error(error.message);
  paths(inspection.property_id, inspection.id);
}

// ---- Descartar rascunho ------------------------------------------------------------
export async function discardInspectionAction(inspectionId: string): Promise<{ propertyId: string }> {
  await assertCanEdit();
  const supabase = createClient();
  const ref = await getDraftRef(supabase, inspectionId);
  const { data: med } = await supabase
    .from("inspection_media")
    .select("storage_path")
    .eq("inspection_id", inspectionId);
  const toRemove = ((med ?? []) as { storage_path: string }[]).map((m) => m.storage_path);
  if (toRemove.length > 0) {
    const { error: sErr } = await supabase.storage.from("documents").remove(toRemove);
    if (sErr) throw new Error(`Could not remove the files: ${sErr.message}`);
  }
  const { error } = await supabase.from("inspections").delete().eq("id", inspectionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/propriedades/${ref.property_id}`);
  return { propertyId: ref.property_id };
}

// ---- Finalizar + PDF --------------------------------------------------------------
// Revalida TUDO no servidor (mesma regra da tela), marca os itens Needs attention
// como "pending" (aprovação do dono), gera o PDF, sobe no bucket, cria o
// documento da propriedade e só então fecha a inspeção.
export async function finishInspectionAction(
  inspectionId: string
): Promise<{ ok: true } | { ok: false; messages: string[] }> {
  await assertCanEdit();
  const supabase = createClient();
  const bundle = await loadInspectionBundle(supabase, inspectionId);
  if (!bundle) throw new Error("Inspection not found.");
  if (bundle.inspection.status !== "draft") throw new Error("This inspection is already finished.");

  const v = validateInspection(bundle.items, bundle.media);
  if (!v.ok) return { ok: false, messages: v.messages };

  const finishedAt = new Date().toISOString();

  // Aprovação: só itens Needs attention, e só os que ainda não têm valor.
  const { error: aErr } = await supabase
    .from("inspection_items")
    .update({ approval: "pending" })
    .eq("inspection_id", inspectionId)
    .eq("result", "attention")
    .is("approval", null);
  if (aErr) throw new Error(aErr.message);

  const { bytes, fileName } = await buildInspectionPdf(supabase, {
    ...bundle,
    inspection: { ...bundle.inspection, finished_at: finishedAt },
  });

  const storagePath = `inspections/${inspectionId}/report-${Date.now()}.pdf`;
  const { error: upErr } = await supabase.storage.from("documents").upload(storagePath, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) throw new Error(`Could not save the PDF: ${upErr.message}`);

  const year = Number(bundle.inspection.inspected_on.slice(0, 4)) || new Date().getFullYear();
  const { data: doc, error: dErr } = await supabase
    .from("documents")
    .insert({
      parent_type: "property",
      parent_id: bundle.property.id,
      file_url: storagePath,
      file_name: fileName,
      content_type: "application/pdf",
      year,
      category: "inspection",
      doc_date: bundle.inspection.inspected_on,
    })
    .select("id")
    .single();
  if (dErr || !doc) throw new Error(dErr?.message ?? "Could not attach the PDF to the property.");

  const { error: fErr } = await supabase
    .from("inspections")
    .update({
      status: "finished",
      finished_at: finishedAt,
      pdf_document_id: (doc as { id: string }).id,
    })
    .eq("id", inspectionId);
  if (fErr) throw new Error(fErr.message);

  paths(bundle.property.id, inspectionId);
  return { ok: true };
}

// ---- Depois de finalizada ---------------------------------------------------------
export async function setItemApprovalAction(itemId: string, approval: InspectionApproval): Promise<void> {
  await assertCanEdit();
  if (approval !== "pending" && approval !== "approved" && approval !== "declined") {
    throw new Error("Invalid approval.");
  }
  const supabase = createClient();
  const { item, inspection } = await getItemRef(supabase, itemId);
  if (item.result !== "attention") throw new Error("Only Needs attention items need the owner's approval.");
  const { error } = await supabase.from("inspection_items").update({ approval }).eq("id", itemId);
  if (error) throw new Error(error.message);
  paths(inspection.property_id, inspection.id);
}

// Cria o service SÓ por clique e SÓ pra item APROVADO pelo dono. Nunca automático.
export async function createServiceFromItemAction(itemId: string): Promise<{ serviceId: string }> {
  const profile = await getProfile();
  if (!can(profile, "operations.edit")) {
    throw new Error("You do not have permission to record services.");
  }
  const supabase = createClient();
  const { item, inspection } = await getItemRef(supabase, itemId);
  if (item.result !== "attention" || item.approval !== "approved") {
    throw new Error("Create a service only after the owner approves this item.");
  }
  if (item.service_id) throw new Error("A service was already created for this item.");

  const note = (item.note ?? "").trim();
  const { data, error } = await supabase
    .from("services")
    .insert({
      property_id: inspection.property_id,
      service_request_date: todayNY(),
      description: note ? `${item.label}: ${note}` : item.label,
      status: "open",
      created_by: profile?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the service.");
  const serviceId = (data as { id: string }).id;

  const { error: lErr } = await supabase
    .from("inspection_items")
    .update({ service_id: serviceId })
    .eq("id", itemId);
  if (lErr) throw new Error(lErr.message);

  paths(inspection.property_id, inspection.id);
  revalidatePath("/services");
  return { serviceId };
}
