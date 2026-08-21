import { createClient } from "@/lib/supabase/server";
import { PageHeader, NoAccess, Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can, canDelete } from "@/lib/auth/capabilities";
import { LISTING_COLUMNS, type Listing } from "@/lib/types";
import { ListingsTable, type ClientOption } from "./ListingsTable";
import {
  createListingAction,
  updateListingAction,
  deleteListingAction,
  restoreListingAction,
  purgeListingAction,
  toggleListingActiveAction,
  toggleListingFeaturedAction,
} from "./actions";

export const dynamic = "force-dynamic";

// Carrega ativas e deletadas juntas: a tela tem uma aba "Deleted" pra restaurar.
// São poucas linhas (dezenas), então 2 selects simples bastam — sem paginação.
async function load() {
  try {
    const supabase = createClient();
    const [live, deleted, clients] = await Promise.all([
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
    ]);
    if (live.error) throw live.error;
    return {
      ok: true as const,
      listings: (live.data ?? []) as unknown as Listing[],
      deleted: (deleted.data ?? []) as unknown as Listing[],
      clients: (clients.data ?? []) as ClientOption[],
    };
  } catch {
    return { ok: false as const, listings: [], deleted: [], clients: [] };
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

  const { ok, listings, deleted, clients } = await load();

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
        canManage={canManage}
        canPurge={canDelete(profile)}
        createAction={createListingAction}
        updateAction={updateListingAction}
        deleteAction={deleteListingAction}
        restoreAction={restoreListingAction}
        purgeAction={purgeListingAction}
        toggleActiveAction={toggleListingActiveAction}
        toggleFeaturedAction={toggleListingFeaturedAction}
      />
    </>
  );
}
