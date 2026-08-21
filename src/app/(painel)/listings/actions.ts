"use server";

// =============================================================================
// Listings — CRUD do anúncio que vai pro site público.
// =============================================================================
// Permissões (Andrea, 2026-08-21):
//   - criar / editar / deletar: QUALQUER papel com `listings.manage`
//     (owner, manager, secretary E realtor). Listing é peça de marketing, não
//     registro financeiro — por isso não segue a regra restrita de clients.
//   - "Delete" = RECUPERÁVEL (seta archived_at). Some da lista e do site, mas
//     dá pra restaurar. É a rede de segurança, já que todo mundo pode deletar.
//   - "Delete permanently" = OWNER ONLY, via RPC admin_delete_listing, e só
//     depois de arquivada. O banco é o guarda de verdade; aqui só re-checo.
// RLS reforça tudo isso no banco (migration 0037).
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/session";
import { can, canDelete } from "@/lib/auth/capabilities";
import type { ListingStatus } from "@/lib/types";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function num(fd: FormData, key: string): number | null {
  const raw = str(fd, key);
  if (raw === null) return null;
  // Aceita "1,250.00", "$1,250" e "1250" — a Andrea digita com $ e vírgula.
  const cleaned = raw.replace(/[$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function int(fd: FormData, key: string): number | null {
  const n = num(fd, key);
  return n === null ? null : Math.round(n);
}

// Link externo (Airbnb / CCIAOR). Guarda sempre com esquema, senão o href vira
// relativo e o clique leva pro próprio portal em vez do site do anúncio.
function link(fd: FormData, key: string): string | null {
  const raw = str(fd, key);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

const LISTING_STATUSES: ListingStatus[] = ["active", "pending", "sold", "rented", "off_market"];

function listingStatus(fd: FormData): ListingStatus {
  const v = str(fd, "listing_status");
  return LISTING_STATUSES.includes(v as ListingStatus) ? (v as ListingStatus) : "active";
}

async function assertCanManage() {
  const profile = await getProfile();
  if (!can(profile, "listings.manage") && !can(profile, "operations.edit")) {
    throw new Error("You do not have permission to manage listings.");
  }
}

// Campos compartilhados por create e update.
// Os 4 tipos são INDEPENDENTES (migration 0040): uma casa pode ser vacation E
// winter. `category` e `listing_type` NÃO são mandados daqui — o trigger
// sync_listing_category deriva os dois das flags, então nunca se contradizem.
function payload(fd: FormData) {
  const flags = {
    is_for_sale: fd.get("is_for_sale") === "1",
    is_year_round: fd.get("is_year_round") === "1",
    is_vacation: fd.get("is_vacation") === "1",
    is_winter: fd.get("is_winter") === "1",
  };
  return {
    ...flags,
    address: str(fd, "address"),
    address2: str(fd, "address2"),
    // Link opcional pra property que a By the C administra. O endereço acima já
    // veio COPIADO do picker — guardamos o id só pra rastrear a origem.
    property_id: str(fd, "property_id"),
    // Dono do imóvel. INTERNO: nunca sai pro site público (ver decisions 2026-08-21).
    client_id: str(fd, "client_id"),
    description: str(fd, "description"),
    available_date: str(fd, "available_date"),
    airbnb_link: link(fd, "airbnb_link"),
    mls_link: link(fd, "mls_link"),
    price: num(fd, "price"),
    listing_status: listingStatus(fd),
    active: str(fd, "active") === "1",
    featured: str(fd, "featured") === "1",
    // listing_id e cover_photo_url saíram do form (Andrea 2026-08-21: não usa o
    // nº do MLS, e as fotos dela são arquivos jpg/heic, não URL). As COLUNAS
    // continuam no banco de propósito — cover_photo_url é onde o upload de foto
    // vai gravar a URL pública quando for construído. Por isso NÃO entram neste
    // payload: um update que mandasse null aqui apagaria a foto sem querer
    // (mesmo furo da lesson 2026-08-14 no updateServiceAction).
    bedrooms: int(fd, "bedrooms"),
    bathrooms: int(fd, "bathrooms"),
    half_baths: int(fd, "half_baths"),
    garage: int(fd, "garage"),
    guests: int(fd, "guests"),
    sqft: int(fd, "sqft"),
  };
}

function assertHasType(body: ReturnType<typeof payload>) {
  if (!body.is_for_sale && !body.is_year_round && !body.is_vacation && !body.is_winter) {
    throw new Error("Pick at least one type for this listing.");
  }
}

export async function createListingAction(fd: FormData) {
  await assertCanManage();
  const body = payload(fd);
  if (!body.address) throw new Error("A property address is required.");
  assertHasType(body);
  const supabase = createClient();
  // slug é gerado pelo trigger set_listing_slug (não mandar daqui).
  const { error } = await supabase.from("listings").insert(body);
  if (error) throw new Error(error.message);
  revalidatePath("/listings");
}

export async function updateListingAction(fd: FormData) {
  await assertCanManage();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing listing reference.");
  const body = payload(fd);
  if (!body.address) throw new Error("A property address is required.");
  assertHasType(body);
  const supabase = createClient();
  const { error } = await supabase
    .from("listings")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/listings");
}

// Liga/desliga o anúncio no site sem abrir o form inteiro. active=false → some
// do site na hora (o site filtra active=true), mas o registro fica intacto.
export async function toggleListingActiveAction(fd: FormData) {
  await assertCanManage();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing listing reference.");
  const active = str(fd, "active") === "1";
  const supabase = createClient();
  const { error } = await supabase
    .from("listings")
    // Desativar também tira de featured: featured sem active é estado morto
    // (o site só olha featured entre as active) e reaparecia na home ao religar.
    .update({
      active,
      ...(active ? {} : { featured: false }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/listings");
}

// Featured = aparece na home do site. Só faz sentido se estiver active.
export async function toggleListingFeaturedAction(fd: FormData) {
  await assertCanManage();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing listing reference.");
  const featured = str(fd, "featured") === "1";
  const supabase = createClient();
  const { error } = await supabase
    .from("listings")
    .update({ featured, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/listings");
}

// DELETE (recuperável) — qualquer um do time. Some da lista e do site; volta
// pelo restoreListingAction. É o "delete" que a Andrea pediu pra todo mundo.
export async function deleteListingAction(fd: FormData) {
  await assertCanManage();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing listing reference.");
  const supabase = createClient();
  const { error } = await supabase
    .from("listings")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/listings");
}

export async function restoreListingAction(fd: FormData) {
  await assertCanManage();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing listing reference.");
  const supabase = createClient();
  const { error } = await supabase
    .from("listings")
    // Volta DESLIGADA do site de propósito: quem restaura revisa antes de
    // republicar. Evita um anúncio velho reaparecendo sozinho no site público.
    .update({ archived_at: null, active: false, featured: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/listings");
}

// HARD DELETE (irreversível) — OWNER ONLY. Toda a regra vive na RPC
// admin_delete_listing (papel owner + precisa estar arquivada), que levanta
// exceção com mensagem humana. Aqui só re-checo (defesa em profundidade) e
// propago a mensagem do banco pro modal.
export async function purgeListingAction(fd: FormData) {
  const profile = await getProfile();
  if (!canDelete(profile)) {
    throw new Error("Only the owner can permanently delete a listing.");
  }
  const id = str(fd, "id");
  if (!id) throw new Error("Missing listing reference.");
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_delete_listing", { l_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/listings");
}

// =============================================================================
// FOTOS DA LISTING
// =============================================================================
// Os BYTES não passam por aqui: o navegador converte (HEIC→JPEG), redimensiona
// e sobe direto pro bucket `listing-photos` com a sessão do usuário (RLS de
// storage exige listings.manage). Estas actions só cuidam da LINHA no banco.
//
// O bucket é PÚBLICO e separado do `documents` (que é privado e guarda invoices
// + IDs de aplicação com SSN). Regra travada: os dois nunca se misturam.

export async function addListingPhotoAction(fd: FormData) {
  await assertCanManage();
  const listingId = str(fd, "listing_id");
  const storagePath = str(fd, "storage_path");
  const url = str(fd, "url");
  if (!listingId || !storagePath || !url) throw new Error("Missing photo details.");

  const supabase = createClient();
  const profile = await getProfile();

  // Nova foto entra no FIM da galeria.
  const { data: last } = await supabase
    .from("listing_photos")
    .select("sort_order")
    .eq("listing_id", listingId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last?.sort_order as number | undefined) ?? -1) + 1;

  const { error } = await supabase.from("listing_photos").insert({
    listing_id: listingId,
    storage_path: storagePath,
    url,
    sort_order: nextOrder,
    created_by: profile?.id ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/listings");
}

// Apaga o ARQUIVO no storage antes da linha. Ordem importa: se a linha sumisse
// primeiro e o remove falhasse, o objeto ficaria órfão no bucket sem nada
// apontando pra ele (é exatamente a sujeira de storage que já temos pendente do
// import de documentos).
export async function deleteListingPhotoAction(fd: FormData) {
  await assertCanManage();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing photo reference.");

  const supabase = createClient();
  const { data: photo, error: readErr } = await supabase
    .from("listing_photos")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!photo) return; // já sumiu — nada a fazer

  const { error: storageErr } = await supabase.storage
    .from("listing-photos")
    .remove([photo.storage_path as string]);
  // Falha de storage NÃO bloqueia: melhor um objeto órfão do que uma foto
  // fantasma que a dona não consegue tirar da tela (e do site).
  if (storageErr) console.error("listing photo storage remove failed:", storageErr.message);

  const { error } = await supabase.from("listing_photos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/listings");
}

// Reordenar = definir quem é a CAPA. O trigger sync_listing_cover reaponta
// listings.cover_photo_url pra primeira foto sozinho.
export async function reorderListingPhotosAction(fd: FormData) {
  await assertCanManage();
  const listingId = str(fd, "listing_id");
  const raw = str(fd, "order"); // ids separados por vírgula, na ordem nova
  if (!listingId || !raw) throw new Error("Missing photo order.");
  const ids = raw.split(",").map((x) => x.trim()).filter(Boolean);
  if (ids.length === 0) return;

  const supabase = createClient();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from("listing_photos")
      .update({ sort_order: i })
      .eq("id", ids[i])
      .eq("listing_id", listingId); // trava: só reordena dentro da própria listing
    if (error) throw new Error(error.message);
  }
  revalidatePath("/listings");
}
