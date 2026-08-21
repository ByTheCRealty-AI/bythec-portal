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
import type { ListingStatus, ListingType, PropertyType } from "@/lib/types";

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

const LISTING_TYPES: ListingType[] = ["rental", "sale"];
const LISTING_STATUSES: ListingStatus[] = ["active", "pending", "sold", "rented", "off_market"];
const CATEGORIES: PropertyType[] = ["year_round_rental", "vacation_rental", "off_season_rental", "for_sale"];

function listingType(fd: FormData): ListingType {
  const v = str(fd, "listing_type");
  return LISTING_TYPES.includes(v as ListingType) ? (v as ListingType) : "rental";
}
function listingStatus(fd: FormData): ListingStatus {
  const v = str(fd, "listing_status");
  return LISTING_STATUSES.includes(v as ListingStatus) ? (v as ListingStatus) : "active";
}
function category(fd: FormData): PropertyType | null {
  const v = str(fd, "category");
  return CATEGORIES.includes(v as PropertyType) ? (v as PropertyType) : null;
}

async function assertCanManage() {
  const profile = await getProfile();
  if (!can(profile, "listings.manage") && !can(profile, "operations.edit")) {
    throw new Error("You do not have permission to manage listings.");
  }
}

// Campos compartilhados por create e update. `category` decide a aba do site;
// listing_type é derivado dela pra os dois nunca se contradizerem.
function payload(fd: FormData) {
  const cat = category(fd);
  return {
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
    category: cat,
    // Derivado: a aba For Sale é o único caso de venda.
    listing_type: cat ? (cat === "for_sale" ? "sale" : "rental") : listingType(fd),
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

export async function createListingAction(fd: FormData) {
  await assertCanManage();
  const body = payload(fd);
  if (!body.address) throw new Error("A property address is required.");
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
