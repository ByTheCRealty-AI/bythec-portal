import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, NoAccess } from "@/components/ui";
import { type Client, type Realtor } from "@/lib/types";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { Handshake } from "lucide-react";
import { SalesSections, type ListingRow } from "./SalesSections";
import { AddSalesClientForm } from "./AddSalesClientForm";
import { addSalesClientAction } from "./actions";

export const dynamic = "force-dynamic";

// Loads everything the Sales screen needs in parallel:
//  - active buy/sell clients (the brokerage people)
//  - active for-sale listings (with the owner = seller join)
//  - the active realtor roster (Andrea, Emily)
async function load() {
  try {
    const supabase = createClient();
    const [clientsRes, listingsRes, realtorsRes] = await Promise.all([
      supabase
        .from("clients")
        .select("*")
        .eq("client_type", "buy_sell_client")
        .is("archived_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("properties")
        .select("id, address, address2, commission_fee, sale_status, realtor_id, owner:owner_id (id, name)")
        .eq("property_type", "for_sale")
        .is("archived_at", null)
        .order("address", { ascending: true }),
      supabase
        .from("realtors")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true }),
    ]);

    if (clientsRes.error) throw clientsRes.error;
    if (listingsRes.error) throw listingsRes.error;
    if (realtorsRes.error) throw realtorsRes.error;

    return {
      ok: true as const,
      clients: (clientsRes.data ?? []) as Client[],
      listings: (listingsRes.data ?? []) as unknown as ListingRow[],
      realtors: (realtorsRes.data ?? []) as Realtor[],
    };
  } catch {
    return {
      ok: false as const,
      clients: [] as Client[],
      listings: [] as ListingRow[],
      realtors: [] as Realtor[],
    };
  }
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink/45">{label}</p>
      <p className="h-display mt-1 text-2xl text-ink">{value}</p>
    </div>
  );
}

export default async function SalesPage() {
  const profile = await getProfile();
  const canEditClients = can(profile, "clients.edit");
  const canEditProps = can(profile, "properties.edit");

  // Gate: needs either side of the brokerage to view.
  if (!canEditClients && !canEditProps) {
    return (
      <>
        <PageHeader title="Sales" />
        <NoAccess />
      </>
    );
  }

  const { ok, clients, listings, realtors } = await load();

  // Deal lifecycle split. The ACTIVE board only shows live deals; closed/expired
  // become history in the "Sold & Closed" tab. Treat a null deal_status as active
  // (legacy rows before the column default kicked in).
  const activeClients = clients.filter((c) => (c.deal_status ?? "active") === "active");
  const finishedClients = clients.filter((c) => c.deal_status === "closed" || c.deal_status === "expired");

  // For-sale listings: active = active/pending/null; finished = sold/expired.
  const activeListings = listings.filter(
    (p) => p.sale_status === "active" || p.sale_status === "pending" || p.sale_status == null
  );
  const finishedListings = listings.filter((p) => p.sale_status === "sold" || p.sale_status === "expired");

  // Split ACTIVE buy/sell clients by side. "both" counts in both buyers and sellers.
  const buyers = activeClients.filter((c) => c.deal_side === "buyer" || c.deal_side === "both");
  const sellers = activeClients.filter((c) => c.deal_side === "seller" || c.deal_side === "both");
  const unclassified = activeClients.filter((c) => !c.deal_side);

  // Metrics reflect the ACTIVE board. "Under contract" = active listings that are
  // pending OR active buy/sell clients whose stage says under_contract.
  const forSale = activeListings.length;
  const underContract =
    activeListings.filter((p) => p.sale_status === "pending").length +
    activeClients.filter((c) => c.sales_stage === "under_contract").length;

  const finishedCount = finishedClients.length + finishedListings.length;

  return (
    <>
      <PageHeader
        title="Sales"
        subtitle="Buyers, sellers and listings for sale."
        action={
          realtors.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink/40">
                Realtors
              </span>
              <div className="flex items-center gap-2">
                {realtors.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white py-1 pl-1 pr-3 text-xs font-semibold text-ink/75 shadow-card"
                    title={r.email ?? r.name}
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/12 text-[10px] font-bold text-primary">
                      {initials(r.name)}
                    </span>
                    {r.name}
                  </span>
                ))}
              </div>
            </div>
          ) : undefined
        }
      />

      {!ok && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06] text-sm text-ink/70">
          Database not connected, or the sales columns are missing. Check the environment
          variables and that the <code className="text-primary">realtors</code> table exists.
        </Card>
      )}

      {/* Metric cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Buyers" value={buyers.length} />
        <MetricCard label="Sellers" value={sellers.length} />
        <MetricCard label="For sale" value={forSale} />
        <MetricCard label="Under contract" value={underContract} />
      </div>

      {/* Add buyer/seller (only if they can edit clients) */}
      {canEditClients && (
        <div className="mb-6">
          <AddSalesClientForm realtors={realtors} action={addSalesClientAction} />
        </div>
      )}

      {ok && clients.length === 0 && listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/[0.12] bg-black/[0.015] px-8 py-16 text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Handshake className="h-6 w-6" />
          </div>
          <h3 className="h-display text-lg text-ink">No sales activity yet</h3>
          <p className="mt-1 max-w-sm text-sm text-ink/55">
            Add a buyer or seller above, or mark a property as For Sale in Properties to start
            tracking the brokerage side.
          </p>
        </div>
      ) : (
        <SalesSections
          buyers={buyers}
          sellers={sellers}
          listings={activeListings}
          unclassified={unclassified}
          finishedClients={finishedClients}
          finishedListings={finishedListings}
          finishedCount={finishedCount}
          realtors={realtors}
          canEditClients={canEditClients}
          canEditProps={canEditProps}
        />
      )}
    </>
  );
}
