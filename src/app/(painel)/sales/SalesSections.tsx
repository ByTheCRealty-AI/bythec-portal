"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Users, Home, AlertTriangle, CheckCircle2 } from "lucide-react";
import { money, date } from "@/lib/format";
import {
  DEAL_SIDE_LABEL,
  BUYER_STAGE_LABEL,
  SELLER_STAGE_LABEL,
  SALE_STATUS_LABEL,
  DEAL_STATUS_LABEL,
  type Client,
  type Realtor,
} from "@/lib/types";
import { InlineSelect } from "./InlineSelect";
import {
  updateSalesClientAction,
  setListingRealtorAction,
  setListingStatusAction,
  setDealOutcomeAction,
} from "./actions";

export type ListingRow = {
  id: string;
  address: string;
  address2: string | null;
  commission_fee: number | null;
  sale_status: string | null;
  realtor_id: string | null;
  owner: { id: string; name: string } | null;
};

type Option = { value: string; label: string };

const REALTOR_PLACEHOLDER = "Unassigned";

const BUYER_STAGE_OPTS: Option[] = Object.entries(BUYER_STAGE_LABEL).map(([value, label]) => ({ value, label }));
const SELLER_STAGE_OPTS: Option[] = Object.entries(SELLER_STAGE_LABEL).map(([value, label]) => ({ value, label }));
const SALE_STATUS_OPTS: Option[] = Object.entries(SALE_STATUS_LABEL).map(([value, label]) => ({ value, label }));
const SIDE_OPTS: Option[] = Object.entries(DEAL_SIDE_LABEL).map(([value, label]) => ({ value, label }));
// Outcome control on active rows: Active / Closed / Expired. Setting closed or
// expired moves the deal to "Sold & Closed" and stamps deal_closed_at.
const DEAL_STATUS_OPTS: Option[] = Object.entries(DEAL_STATUS_LABEL).map(([value, label]) => ({ value, label }));

// Tabs (pills) over the four sections — matches the approved mockup. Default
// shows Buyers; switching is purely client-side (no refetch).
type Tab = "buyers" | "sellers" | "for_sale" | "sold_closed";

export function SalesSections({
  buyers,
  sellers,
  listings,
  unclassified,
  finishedClients,
  finishedListings,
  finishedCount,
  realtors,
  canEditClients,
  canEditProps,
}: {
  buyers: Client[];
  sellers: Client[];
  listings: ListingRow[];
  unclassified: Client[];
  finishedClients: Client[];
  finishedListings: ListingRow[];
  finishedCount: number;
  realtors: Realtor[];
  canEditClients: boolean;
  canEditProps: boolean;
}) {
  const [tab, setTab] = useState<Tab>("buyers");
  const realtorOpts: Option[] = realtors.map((r) => ({ value: r.id, label: r.name }));
  // Name lookup for the (read-only) finished view, which doesn't render selects.
  const realtorName = (id: string | null): string =>
    (id && realtors.find((r) => r.id === id)?.name) || "Unassigned";

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: "buyers", label: "Buyers", count: buyers.length },
    { key: "sellers", label: "Sellers", count: sellers.length },
    { key: "for_sale", label: "For sale", count: listings.length },
    { key: "sold_closed", label: "Sold & Closed", count: finishedCount },
  ];

  return (
    <div className="space-y-6">
      {/* Pills */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition " +
                (active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-black/10 bg-white text-ink/60 hover:text-ink hover:border-black/20")
              }
            >
              {t.label}
              <span className={active ? "text-primary/70" : "text-ink/40"}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Needs-classification group — always visible if any unclassified, so
          they don't get lost behind the buyer/seller split. */}
      {unclassified.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-secondary/30 bg-secondary/[0.04] shadow-card">
          <div className="flex items-center gap-2 border-b border-secondary/20 px-5 py-3">
            <AlertTriangle className="h-4 w-4 text-secondary" />
            <h2 className="text-sm font-bold text-ink">Needs buyer / seller</h2>
            <span className="text-xs text-ink/45">
              {unclassified.length} buy/sell client{unclassified.length === 1 ? "" : "s"} not classified yet
            </span>
          </div>
          <PeopleTable
            people={unclassified}
            kind="unclassified"
            realtorOpts={realtorOpts}
            canEdit={canEditClients}
          />
        </section>
      )}

      {tab === "buyers" && (
        <Section title="Buyers" icon={<Users className="h-5 w-5" />}>
          {buyers.length > 0 ? (
            <PeopleTable people={buyers} kind="buyer" realtorOpts={realtorOpts} canEdit={canEditClients} />
          ) : (
            <EmptyRow message="No buyers yet. Add one above, or set a buy/sell client's side to Buyer." />
          )}
        </Section>
      )}

      {tab === "sellers" && (
        <Section title="Sellers" icon={<Users className="h-5 w-5" />}>
          {sellers.length > 0 ? (
            <PeopleTable people={sellers} kind="seller" realtorOpts={realtorOpts} canEdit={canEditClients} />
          ) : (
            <EmptyRow message="No sellers yet. Add one above, or set a buy/sell client's side to Seller." />
          )}
        </Section>
      )}

      {tab === "for_sale" && (
        <Section title="For sale" icon={<Home className="h-5 w-5" />}>
          {listings.length > 0 ? (
            <ListingsTable listings={listings} realtorOpts={realtorOpts} canEdit={canEditProps} />
          ) : (
            <EmptyRow message="No listings for sale. Mark a property as For Sale in Properties to see it here." />
          )}
        </Section>
      )}

      {tab === "sold_closed" && (
        <FinishedSection
          finishedClients={finishedClients}
          finishedListings={finishedListings}
          realtorName={realtorName}
          canEditClients={canEditClients}
          canEditProps={canEditProps}
        />
      )}
    </div>
  );
}

// ---- "Sold & Closed" view ---------------------------------------------------
// History, NOT archive. Groups finished items by outcome: Closed (won) vs
// Expired (no deal). Each row can be reopened back onto the active board.
function FinishedSection({
  finishedClients,
  finishedListings,
  realtorName,
  canEditClients,
  canEditProps,
}: {
  finishedClients: Client[];
  finishedListings: ListingRow[];
  realtorName: (id: string | null) => string;
  canEditClients: boolean;
  canEditProps: boolean;
}) {
  const closedClients = finishedClients.filter((c) => c.deal_status === "closed");
  const expiredClients = finishedClients.filter((c) => c.deal_status === "expired");
  const closedListings = finishedListings.filter((p) => p.sale_status === "sold");
  const expiredListings = finishedListings.filter((p) => p.sale_status === "expired");

  const wonCount = closedClients.length + closedListings.length;
  const expiredCount = expiredClients.length + expiredListings.length;

  if (wonCount === 0 && expiredCount === 0) {
    return (
      <Section title="Sold & Closed" icon={<CheckCircle2 className="h-5 w-5" />}>
        <EmptyRow message="Nothing finished yet. Mark a buyer, seller or listing as Closed or Expired to move it here." />
      </Section>
    );
  }

  return (
    <Section title="Sold & Closed" icon={<CheckCircle2 className="h-5 w-5" />}>
      <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
        <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
          <tr>
            <th className="px-5 py-3 font-bold">Name / Address</th>
            <th className="px-5 py-3 font-bold">Side</th>
            <th className="px-5 py-3 font-bold">Realtor</th>
            <th className="px-5 py-3 font-bold">Outcome</th>
            <th className="px-5 py-3 font-bold">Reopen</th>
          </tr>
        </thead>
        <tbody>
          {/* Closed (won) group */}
          {wonCount > 0 && <GroupHeader label="Closed (won)" count={wonCount} tone="won" />}
          {closedClients.map((c, i) => (
            <FinishedClientRow
              key={c.id}
              client={c}
              tone="won"
              striped={i % 2 === 1}
              realtorName={realtorName}
              canEdit={canEditClients}
            />
          ))}
          {closedListings.map((p, i) => (
            <FinishedListingRow
              key={p.id}
              listing={p}
              tone="won"
              striped={i % 2 === 1}
              realtorName={realtorName}
              canEdit={canEditProps}
            />
          ))}

          {/* Expired (no deal) group */}
          {expiredCount > 0 && <GroupHeader label="Expired (no deal)" count={expiredCount} tone="expired" />}
          {expiredClients.map((c, i) => (
            <FinishedClientRow
              key={c.id}
              client={c}
              tone="expired"
              striped={i % 2 === 1}
              realtorName={realtorName}
              canEdit={canEditClients}
            />
          ))}
          {expiredListings.map((p, i) => (
            <FinishedListingRow
              key={p.id}
              listing={p}
              tone="expired"
              striped={i % 2 === 1}
              realtorName={realtorName}
              canEdit={canEditProps}
            />
          ))}
        </tbody>
      </table></div>
    </Section>
  );
}

function GroupHeader({ label, count, tone }: { label: string; count: number; tone: "won" | "expired" }) {
  return (
    <tr className="border-t border-black/[0.05]">
      <td colSpan={5} className="bg-black/[0.02] px-5 py-2.5">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink/55">
          <OutcomeBadge tone={tone} label={tone === "won" ? "Closed" : "Expired"} />
          {label}
          <span className="text-ink/35">{count}</span>
        </span>
      </td>
    </tr>
  );
}

// Closed = success/green (brand primary). Expired = muted/neutral. Uses the
// project's semantic CSS-var colors (primary/ink) — no hard-coded hex.
function OutcomeBadge({ tone, label }: { tone: "won" | "expired"; label: string }) {
  const cls =
    tone === "won"
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-black/10 bg-black/[0.04] text-ink/50";
  return (
    <span className={"inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold " + cls}>
      {label}
    </span>
  );
}

function ReopenButton({ id, canEdit }: { id: string; canEdit: boolean }) {
  if (!canEdit) return <span className="text-xs text-ink/35">—</span>;
  return (
    <form action={setDealOutcomeAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="deal_status" value="active" />
      <button
        type="submit"
        className="rounded-lg border border-black/[0.12] bg-white px-2.5 py-1 text-xs font-semibold text-ink/70 transition hover:border-primary/40 hover:text-primary"
      >
        Reopen
      </button>
    </form>
  );
}

function FinishedClientRow({
  client: c,
  tone,
  striped,
  realtorName,
  canEdit,
}: {
  client: Client;
  tone: "won" | "expired";
  striped: boolean;
  realtorName: (id: string | null) => string;
  canEdit: boolean;
}) {
  return (
    <tr className={"border-t border-black/[0.05] " + (striped ? "bg-black/[0.015]" : "")}>
      <td className="px-5 py-3.5">
        <Link href={`/clientes/${c.id}`} className="font-semibold text-ink hover:text-primary">
          {c.name}
        </Link>
        {c.co_client_name && <span className="block text-xs text-ink/45">&amp; {c.co_client_name}</span>}
      </td>
      <td className="px-5 py-3.5 text-ink/65">{c.deal_side ? DEAL_SIDE_LABEL[c.deal_side] : "—"}</td>
      <td className="px-5 py-3.5 text-ink/65">{realtorName(c.realtor_id)}</td>
      <td className="px-5 py-3.5">
        <span className="inline-flex items-center gap-2">
          <OutcomeBadge tone={tone} label={tone === "won" ? "Closed" : "Expired"} />
          {c.deal_closed_at && <span className="text-xs text-ink/45">{date(c.deal_closed_at)}</span>}
        </span>
      </td>
      <td className="px-5 py-3.5">
        <ReopenButton id={c.id} canEdit={canEdit} />
      </td>
    </tr>
  );
}

function FinishedListingRow({
  listing: p,
  tone,
  striped,
  realtorName,
  canEdit,
}: {
  listing: ListingRow;
  tone: "won" | "expired";
  striped: boolean;
  realtorName: (id: string | null) => string;
  canEdit: boolean;
}) {
  // Reopening a listing means putting it back on the board as Active.
  return (
    <tr className={"border-t border-black/[0.05] " + (striped ? "bg-black/[0.015]" : "")}>
      <td className="px-5 py-3.5">
        <Link href={`/propriedades/${p.id}`} className="font-semibold text-ink hover:text-primary">
          {p.address}
        </Link>
        {p.address2 && <span className="block text-xs text-ink/45">{p.address2}</span>}
      </td>
      <td className="px-5 py-3.5 text-ink/65">Listing</td>
      <td className="px-5 py-3.5 text-ink/65">{realtorName(p.realtor_id)}</td>
      <td className="px-5 py-3.5">
        <OutcomeBadge tone={tone} label={tone === "won" ? "Closed" : "Expired"} />
      </td>
      <td className="px-5 py-3.5">
        {canEdit ? (
          <form action={setListingStatusAction}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="sale_status" value="active" />
            <button
              type="submit"
              className="rounded-lg border border-black/[0.12] bg-white px-2.5 py-1 text-xs font-semibold text-ink/70 transition hover:border-primary/40 hover:text-primary"
            >
              Reopen
            </button>
          </form>
        ) : (
          <span className="text-xs text-ink/35">—</span>
        )}
      </td>
    </tr>
  );
}

// ---- Module-scope sub-components (hoisted — no remount on parent re-render) --

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-card">
      <div className="flex items-center gap-2.5 border-b border-black/[0.06] px-5 py-3.5">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        <h2 className="text-sm font-bold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <p className="px-5 py-10 text-center text-sm text-ink/50">{message}</p>;
}

function PeopleTable({
  people,
  kind,
  realtorOpts,
  canEdit,
}: {
  people: Client[];
  kind: "buyer" | "seller" | "unclassified";
  realtorOpts: Option[];
  canEdit: boolean;
}) {
  const stageOpts = kind === "seller" ? SELLER_STAGE_OPTS : BUYER_STAGE_OPTS;
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
      <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
        <tr>
          <th className="px-5 py-3 font-bold">Name</th>
          <th className="px-5 py-3 font-bold">Contact</th>
          {kind === "unclassified" && <th className="px-5 py-3 font-bold">Side</th>}
          <th className="px-5 py-3 font-bold">Stage</th>
          <th className="px-5 py-3 font-bold">Realtor</th>
          <th className="px-5 py-3 font-bold">Outcome</th>
        </tr>
      </thead>
      <tbody>
        {people.map((c, i) => (
          <tr
            key={c.id}
            className={"border-t border-black/[0.05] " + (i % 2 === 1 ? "bg-black/[0.015]" : "")}
          >
            <td className="px-5 py-3.5">
              <Link href={`/clientes/${c.id}`} className="font-semibold text-ink hover:text-primary">
                {c.name}
              </Link>
              {c.co_client_name && (
                <span className="block text-xs text-ink/45">&amp; {c.co_client_name}</span>
              )}
            </td>
            <td className="px-5 py-3.5 text-ink/65">
              {c.email ?? "—"}
              {c.phone && <span className="block text-xs text-ink/45">{c.phone}</span>}
            </td>
            {kind === "unclassified" && (
              <td className="px-5 py-3.5">
                <InlineSelect
                  name="deal_side"
                  value={c.deal_side}
                  options={SIDE_OPTS}
                  extra={{ id: c.id }}
                  action={updateSalesClientAction}
                  placeholder="Set side"
                  disabled={!canEdit}
                />
              </td>
            )}
            <td className="px-5 py-3.5">
              <InlineSelect
                name="sales_stage"
                value={c.sales_stage}
                options={stageOpts}
                extra={{ id: c.id }}
                action={updateSalesClientAction}
                placeholder="Set stage"
                disabled={!canEdit}
              />
            </td>
            <td className="px-5 py-3.5">
              <InlineSelect
                name="realtor_id"
                value={c.realtor_id}
                options={realtorOpts}
                extra={{ id: c.id }}
                action={updateSalesClientAction}
                placeholder={REALTOR_PLACEHOLDER}
                disabled={!canEdit}
              />
            </td>
            <td className="px-5 py-3.5">
              {/* Active / Closed / Expired. Setting closed or expired moves the
                  deal to "Sold & Closed" and stamps deal_closed_at server-side. */}
              <InlineSelect
                name="deal_status"
                value={c.deal_status ?? "active"}
                options={DEAL_STATUS_OPTS}
                extra={{ id: c.id }}
                action={setDealOutcomeAction}
                placeholder="Active"
                disabled={!canEdit}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function ListingsTable({
  listings,
  realtorOpts,
  canEdit,
}: {
  listings: ListingRow[];
  realtorOpts: Option[];
  canEdit: boolean;
}) {
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
      <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
        <tr>
          <th className="px-5 py-3 font-bold">Address</th>
          <th className="px-5 py-3 font-bold">Seller</th>
          <th className="px-5 py-3 font-bold">Commission</th>
          <th className="px-5 py-3 font-bold">Sale status</th>
          <th className="px-5 py-3 font-bold">Realtor</th>
        </tr>
      </thead>
      <tbody>
        {listings.map((p, i) => (
          <tr
            key={p.id}
            className={"border-t border-black/[0.05] " + (i % 2 === 1 ? "bg-black/[0.015]" : "")}
          >
            <td className="px-5 py-3.5">
              <Link href={`/propriedades/${p.id}`} className="font-semibold text-ink hover:text-primary">
                {p.address}
              </Link>
              {p.address2 && <span className="block text-xs text-ink/45">{p.address2}</span>}
            </td>
            <td className="px-5 py-3.5 text-ink/65">
              {p.owner ? (
                <Link href={`/clientes/${p.owner.id}`} className="hover:text-primary">
                  {p.owner.name}
                </Link>
              ) : (
                "—"
              )}
            </td>
            <td className="px-5 py-3.5 text-ink/65">{money(p.commission_fee)}</td>
            <td className="px-5 py-3.5">
              <InlineSelect
                name="sale_status"
                value={p.sale_status}
                options={SALE_STATUS_OPTS}
                extra={{ id: p.id }}
                action={setListingStatusAction}
                placeholder="Set status"
                disabled={!canEdit}
              />
            </td>
            <td className="px-5 py-3.5">
              <InlineSelect
                name="realtor_id"
                value={p.realtor_id}
                options={realtorOpts}
                extra={{ id: p.id }}
                action={setListingRealtorAction}
                placeholder={REALTOR_PLACEHOLDER}
                disabled={!canEdit}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
