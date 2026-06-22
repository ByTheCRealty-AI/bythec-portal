import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { money, date } from "@/lib/format";
import { Anchor } from "lucide-react";
import type { Invoice, InvoiceItem, Client, Property } from "@/lib/types";
import { InvoiceBackButton, InvoiceActions } from "./InvoiceActions";

export const dynamic = "force-dynamic";

const COMPANY = {
  name: "By the C Realty and Property Management LLC",
  brand: "By the C",
  email: "info@bythecrealty.com",
  location: "Cape Cod, MA",
  site: "bythecrealty.com",
};

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  const full = can(profile, "financials.full");
  const serviceOnly = !full && can(profile, "invoices.service");
  if (!full && !serviceOnly) redirect("/?denied=invoices");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, client:client_id(id,name,email,phone,billing_address,billing_address2,billing_city,billing_state,billing_zip), property:property_id(id,address,address2,seasonal_commission_rate), items:invoice_items(*)"
    )
    .eq("id", params.id)
    .single();
  if (error || !data) notFound();

  const invoice = data as unknown as Invoice & {
    client: Client | null;
    property: Pick<Property, "id" | "address" | "address2" | "seasonal_commission_rate"> | null;
    items: InvoiceItem[];
  };

  // Service-only users não podem abrir seasonal (RLS já bloqueia o SELECT, mas
  // reforçamos pra não vazar layout).
  if (serviceOnly && invoice.kind === "seasonal") redirect("/invoices");

  const archived = invoice.archived_at !== null;
  const isSeasonal = invoice.kind === "seasonal";
  const numberLabel = isSeasonal
    ? `Invoice #${invoice.invoice_number}`
    : `Service Invoice #${invoice.invoice_number}`;

  const client = invoice.client;
  const billLines = client
    ? [
        client.name,
        [client.billing_address, client.billing_address2].filter(Boolean).join(", "),
        [client.billing_city, client.billing_state, client.billing_zip].filter(Boolean).join(" "),
        client.email,
        client.phone,
      ].filter((l): l is string => Boolean(l))
    : [];

  const serviceAddress =
    invoice.property?.address ??
    invoice.service_address ??
    null;

  return (
    <>
      <InvoiceBackButton />

      <div className="print-hide mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="h-display text-2xl text-ink">{numberLabel}</h1>
          {invoice.paid ? (
            <Badge tone="gold">Paid</Badge>
          ) : (
            <Badge tone="orange">Due</Badge>
          )}
          {archived && <Badge tone="muted">Archived</Badge>}
        </div>
        <InvoiceActions id={invoice.id} paid={invoice.paid} archived={archived} />
      </div>

      {/* ===================== BRANDED INVOICE (printable) ===================== */}
      <article id="invoice-sheet" className="mx-auto max-w-3xl rounded-2xl border border-black/[0.08] bg-white p-8 shadow-card sm:p-10">
        {/* Header */}
        <header className="mb-8 flex items-start justify-between gap-6 border-b border-black/[0.08] pb-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
              <Anchor className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <div>
              <p className="h-display text-lg leading-tight text-ink">{COMPANY.brand}</p>
              <p className="text-xs leading-tight text-ink/55">
                {isSeasonal ? "Realty and Property Management" : "Realty and Property Management LLC"}
              </p>
              <p className="mt-1 text-xs text-ink/45">{COMPANY.email} · {COMPANY.location}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/45">
              {isSeasonal ? "Invoice" : "Service Invoice"}
            </p>
            <p className="h-display text-xl text-ink">#{invoice.invoice_number}</p>
            <p className="mt-1 text-xs text-ink/55">Date: {date(invoice.date)}</p>
            {isSeasonal && invoice.platform && (
              <p className="text-xs text-ink/55">Platform: {invoice.platform}</p>
            )}
            {!isSeasonal && <p className="text-xs text-ink/55">Due: When received</p>}
          </div>
        </header>

        {isSeasonal ? (
          <SeasonalBody invoice={invoice} billLines={billLines} />
        ) : (
          <ServiceBody invoice={invoice} billLines={billLines} serviceAddress={serviceAddress} />
        )}

        {invoice.notes && (
          <div className="mt-8 border-t border-black/[0.08] pt-4 text-sm text-ink/65">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink/45">Notes</span>
            <p className="whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        <footer className="mt-8 border-t border-black/[0.08] pt-4 text-center text-xs text-ink/40">
          {COMPANY.name} · {COMPANY.site}
        </footer>
      </article>

      {/* Print CSS: a impressão mostra só a folha do invoice (oculta sidebar/botões). */}
      <style>{`
        @media print {
          @page { margin: 14mm; }
          body { background: #fff !important; }
          aside, .print-hide { display: none !important; }
          main { padding: 0 !important; }
          #invoice-sheet {
            box-shadow: none !important;
            border: none !important;
            max-width: 100% !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </>
  );
}

// ---- SERVICE body ----------------------------------------------------------
function ServiceBody({
  invoice,
  billLines,
  serviceAddress,
}: {
  invoice: Invoice & { items: InvoiceItem[] };
  billLines: string[];
  serviceAddress: string | null;
}) {
  const labor = invoice.items.filter((i) => i.category === "labor");
  const material = invoice.items.filter((i) => i.category === "material");
  const laborTotal = invoice.labor_total ?? labor.reduce((a, i) => a + i.total, 0);
  const materialTotal = invoice.material_total ?? material.reduce((a, i) => a + i.total, 0);
  const total = laborTotal + materialTotal;

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <AddressBlock title="Bill to" lines={billLines} />
        <AddressBlock title="Service address" lines={serviceAddress ? [serviceAddress] : []} />
      </div>

      <table className="w-full text-left text-sm">
        <thead className="border-b border-black/[0.1] text-xs uppercase tracking-wider text-ink/50">
          <tr>
            <th className="py-2 font-bold">Description</th>
            <th className="py-2 font-bold">Type</th>
            <th className="py-2 text-right font-bold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it, i) => (
            <tr key={it.id} className={i % 2 === 1 ? "bg-black/[0.015]" : ""}>
              <td className="py-2.5 pr-3 text-ink/85">{it.description}</td>
              <td className="py-2.5 pr-3">
                <span className="text-xs font-medium text-ink/55">
                  {it.category === "material" ? "Material" : "Labor"}
                </span>
              </td>
              <td className="py-2.5 text-right text-ink/85">{money(it.total)}</td>
            </tr>
          ))}
          {invoice.items.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-center text-sm text-ink/40">No line items.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-6 ml-auto max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between text-ink/65">
          <span>Total Labor</span>
          <span className="font-semibold text-ink">{money(laborTotal)}</span>
        </div>
        <div className="flex justify-between text-ink/65">
          <span>Total Material</span>
          <span className="font-semibold text-ink">{money(materialTotal)}</span>
        </div>
        <div className="flex justify-between border-t border-black/[0.1] pt-2 text-base">
          <span className="font-semibold text-ink">Total</span>
          <span className="h-display text-primary">{money(total)}</span>
        </div>
      </div>
    </>
  );
}

// ---- SEASONAL body (2 columns) ---------------------------------------------
function SeasonalBody({
  invoice,
  billLines,
}: {
  invoice: Invoice & { items: InvoiceItem[]; property: Pick<Property, "address"> | null };
  billLines: string[];
}) {
  const guestItems = invoice.items.filter((i) => i.guest);
  const ownerItems = invoice.items.filter((i) => i.owner);

  return (
    <>
      {/* Invoice to + reservation */}
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <AddressBlock title="Invoice to" lines={billLines} />
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/45">Reservation details</span>
          <div className="space-y-0.5 text-sm text-ink/80">
            {invoice.guest_name && <p>Guest: {invoice.guest_name}</p>}
            {(invoice.dates_reserved_start || invoice.dates_reserved_end) && (
              <p>Dates: {date(invoice.dates_reserved_start)} – {date(invoice.dates_reserved_end)}</p>
            )}
            {invoice.property?.address && <p>Property: {invoice.property.address}</p>}
            {invoice.rental_nights != null && <p>Nights: {invoice.rental_nights}</p>}
          </div>
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Column
          title="Paid by Guest"
          items={guestItems}
          totalLabel="Total Paid by Guest"
          totalValue={invoice.total_paid_by_guest ?? 0}
          accent="secondary"
        />
        <Column
          title="Owner Overview"
          items={ownerItems}
          totalLabel="Total Received by Owner"
          totalValue={invoice.total_received_by_owner ?? 0}
          accent="primary"
          commission={invoice.bythec_commission}
        />
      </div>
    </>
  );
}

function Column({
  title,
  items,
  totalLabel,
  totalValue,
  accent,
  commission,
}: {
  title: string;
  items: InvoiceItem[];
  totalLabel: string;
  totalValue: number;
  accent: "primary" | "secondary";
  commission?: number | null;
}) {
  return (
    <div className="rounded-xl border border-black/[0.07] bg-black/[0.012] p-5">
      <h3 className="h-display mb-3 text-sm text-ink">{title}</h3>
      <div className="space-y-1.5 text-sm">
        {items.map((it) => (
          <div key={it.id} className="flex justify-between gap-3 text-ink/75">
            <span>{it.description}</span>
            <span className={it.total < 0 ? "text-ink/55" : "text-ink/85"}>{money(it.total)}</span>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-ink/40">—</p>}
      </div>
      <div className="mt-4 flex justify-between border-t border-black/[0.1] pt-3 text-base font-semibold text-ink">
        <span>{totalLabel}</span>
        <span className={accent === "primary" ? "h-display text-primary" : "h-display text-secondary"}>
          {money(totalValue)}
        </span>
      </div>
    </div>
  );
}

function AddressBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/45">{title}</span>
      {lines.length > 0 ? (
        <div className="space-y-0.5 text-sm text-ink/80">
          {lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink/40">—</p>
      )}
    </div>
  );
}
