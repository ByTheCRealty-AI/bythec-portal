import { createClient } from "@/lib/supabase/server";
import { PageHeader, NoAccess, Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can, canDelete } from "@/lib/auth/capabilities";
import { LISTING_COLUMNS, type Listing, type ListingPhoto, type ListingPropertyOption } from "@/lib/types";
import { ListingsTable, type ClientOption } from "./ListingsTable";
import {
  createListingAction,
  updateListingAction,
  addListingPhotoAction,
  deleteListingPhotoAction,
  reorderListingPhotosAction,
  deleteListingAction,
  restoreListingAction,
  purgeListingAction,
  toggleListingActiveAction,
  toggleListingFeaturedAction,
  setListingLinkAction,
} from "./actions";

export const dynamic = "force-dynamic";

// Carrega ativas e deletadas juntas: a tela tem uma aba "Deleted" pra restaurar.
// São poucas linhas (dezenas), então 2 selects simples bastam — sem paginação.
async function load() {
  try {
    const supabase = createClient();
    const [live, deleted, clients, properties, photos] = await Promise.all([
      supabase
        .from("listings")
        .select(LISTING_COLUMNS)
        .is("archived_at", null)
        .order("featured", { ascending: false }) // destaque no topo
        .order("active", { ascending: false }) // depois as que estão no ar
        .order("created_at", { ascending: false }),
      supabase
        .from("listings")
        .select(LISTING_COLUMNS)
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false }),
      // Dono do imóvel (opcional). Só ativos, pra não poluir o dropdown.
      supabase
        .from("clients")
        .select("id, name")
        .is("archived_at", null)
        .order("name", { ascending: true }),
      // Propriedades já administradas — alimentam o picker "pull from an
      // existing property", que preenche endereço/dono/categoria sozinho.
      supabase
        .from("properties")
        .select("id, address, address2, owner_id, is_for_sale, is_year_round, is_vacation, is_winter, rent_price, photo_url")
        .is("archived_at", null)
        .order("address", { ascending: true }),
      // Todas as fotos de uma vez (dezenas de linhas) e agrupadas em memória —
      // mais barato que uma query por listing.
      supabase
        .from("listing_photos")
        .select("id, listing_id, storage_path, url, sort_order, created_at, created_by")
        .order("sort_order", { ascending: true }),
    ]);
    if (live.error) throw live.error;
    return {
      ok: true as const,
      listings: (live.data ?? []) as unknown as Listing[],
      deleted: (deleted.data ?? []) as unknown as Listing[],
      clients: (clients.data ?? []) as ClientOption[],
      properties: (properties.data ?? []) as ListingPropertyOption[],
      photos: (photos.data ?? []) as ListingPhoto[],
    };
  } catch {
    return { ok: false as const, listings: [], deleted: [], clients: [], properties: [], photos: [] };
  }
}

export default async function ListingsPage() {
  const profile = await getProfile();
  // listings.manage = opera (todos os papéis internos + realtor).
  // listings.view = só olha. operations.edit entra por compatibilidade.
  const canManage = can(profile, "listings.manage") || can(profile, "operations.edit");
  if (!canManage && !can(profile, "listings.view")) {
    return (
      <>
        <PageHeader title="Listings" />
        <NoAccess />
      </>
    );
  }

  const { ok, listings, deleted, clients, properties, photos } = await load();

  // listing_id -> fotos, na ordem de exibição.
  const photosByListing: Record<string, ListingPhoto[]> = {};
  for (const p of photos) (photosByListing[p.listing_id] ??= []).push(p);

  return (
    <>
      <PageHeader
        title="Listings"
        subtitle="What the public website shows. Turn a listing off to pull it from the site without deleting it."
      />

      {!ok && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06] text-sm text-ink/70">
          Database not connected. Check the environment variables{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </Card>
      )}

      <ListingsTable
        listings={listings}
        deleted={deleted}
        clients={clients}
        properties={properties}
        photosByListing={photosByListing}
        canManage={canManage}
        canPurge={canDelete(profile)}
        createAction={createListingAction}
        updateAction={updateListingAction}
        deleteAction={deleteListingAction}
        restoreAction={restoreListingAction}
        purgeAction={purgeListingAction}
        toggleActiveAction={toggleListingActiveAction}
        toggleFeaturedAction={toggleListingFeaturedAction}
        setLinkAction={setListingLinkAction}
        addPhotoAction={addListingPhotoAction}
        deletePhotoAction={deleteListingPhotoAction}
        reorderPhotosAction={reorderListingPhotosAction}
      />
    </>
  );
}
