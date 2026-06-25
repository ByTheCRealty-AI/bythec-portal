"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Users, Home, AlertTriangle } from "lucide-react";
import { money } from "@/lib/format";
import {
  DEAL_SIDE_LABEL,
  BUYER_STAGE_LABEL,
  SELLER_STAGE_LABEL,
  SALE_STATUS_LABEL,
  type Client,
  type Realtor,
} from "@/lib/types";
import { InlineSelect } from "./InlineSelect";
import {
  updateSalesClientAction,
  setListingRealtorAction,
  setListingStatusAction,
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

// Tabs (pills) over the three sections — matches the approved mockup. Default
// shows Buyers; switching is purely client-side (no refetch).
type Tab = "buyers" | "sellers" | "for_sale";

export function SalesSections({
  buyers,
  sellers,
  listings,
  unclassified,
  realtors,
  canEditClients,
  canEditProps,
}: {
  buyers: Client[];
  sellers: Client[];
  listings: ListingRow[];
  unclassified: Client[];
  realtors: Realtor[];
  canEditClients: boolean;
  canEditProps: boolean;
}) {
  const [tab, setTab] = useState<Tab>("buyers");
  const realtorOpts: Option[] = realtors.map((r) => ({ value: r.id, label: r.name }));

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: "buyers", label: "Buyers", count: buyers.length },
    { key: "sellers", label: "Sellers", count: sellers.length },
    { key: "for_sale", label: "For sale", count: listings.length },
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
    </div>
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
    <table className="w-full text-left text-sm">
      <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
        <tr>
          <th className="px-5 py-3 font-bold">Name</th>
          <th className="px-5 py-3 font-bold">Contact</th>
          {kind === "unclassified" && <th className="px-5 py-3 font-bold">Side</th>}
          <th className="px-5 py-3 font-bold">Stage</th>
          <th className="px-5 py-3 font-bold">Realtor</th>
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
          </tr>
        ))}
      </tbody>
    </table>
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
    <table className="w-full text-left text-sm">
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
    </table>
  );
}
