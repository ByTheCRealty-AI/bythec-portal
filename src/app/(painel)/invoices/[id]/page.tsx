import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { money, date } from "@/lib/format";
import type { Invoice, InvoiceItem, InvoiceAttachment, Client, Property, SeasonalCommissionBase } from "@/lib/types";
import { SEASONAL_COMMISSION_BASE_LABEL } from "@/lib/types";
import { InvoiceBackButton, InvoiceActions } from "./InvoiceActions";
import { InvoiceDocuments } from "../InvoiceDocuments";
import { addInvoiceAttachmentAction, deleteInvoiceAttachmentAction } from "../actions";

// Texto curto da base da comissão (ex.: "10% of host payout"). Usa o que ficou
// TRAVADO no invoice (commission_base/commission_rate); cai pra base da property
// pra invoices antigos sem o campo.
function commissionBasisLabel(
  inv: Invoice & {
    property: Pick<Property, "seasonal_commission_base"> | null;
  }
): string | null {
  const base: SeasonalCommissionBase | null =
    inv.commission_base ?? inv.property?.seasonal_commission_base ?? null;
  if (!base) return null;
  // Só mostra a base quando é o HOST PAYOUT. Quando é o total pago pelo guest,
  // não escreve nada (decisão da Andrea — o invoice não expõe essa base).
  if (base === "paid_by_guest") return null;
  const baseText = SEASONAL_COMMISSION_BASE_LABEL[base].toLowerCase();
  const rate = inv.commission_rate;
  if (rate == null) return `of ${baseText}`;
  const pct = Math.round(rate * 1000) / 10; // ex.: 0.10 -> 10
  return `${pct}% of ${baseText}`;
}

export const dynamic = "force-dynamic";

const COMPANY = {
  name: "By the C Realty and Property Management LLC",
  brand: "By the C Realty",
  email: "info@bythecrealty.com",
  location: "Cape Cod, MA",
  site: "bythecrealty.com",
};

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  const full = can(profile, "financials.full");
  const seasonalAccess = full || can(profile, "invoices.seasonal");
  const serviceAccess = full || can(profile, "invoices.service");
  if (!seasonalAccess && !serviceAccess) redirect("/?denied=invoices");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, client:client_id(id,name,email,phone,billing_address,billing_address2,billing_city,billing_state,billing_zip), property:property_id(id,address,address2,seasonal_commission_rate,seasonal_commission_base), items:invoice_items(*), attachments:invoice_attachments(id,invoice_id,file_url,file_name,content_type,created_at)"
    )
    .eq("id", params.id)
    .single();
  if (error || !data) notFound();

  const invoice = data as unknown as Invoice & {
    client: Client | null;
    property: Pick<Property, "id" | "address" | "address2" | "seasonal_commission_rate" | "seasonal_commission_base"> | null;
    items: InvoiceItem[];
    attachments: InvoiceAttachment[] | null;
  };

  // Bloqueia abrir um tipo que a pessoa não tem acesso (RLS já bloqueia o SELECT,
  // mas reforçamos pra não vazar layout).
  if (invoice.kind === "seasonal" && !seasonalAccess) redirect("/invoices");
  if (invoice.kind === "service" && !serviceAccess) redirect("/invoices");

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
            <img src="/logo.png" alt="By the C Realty" className="h-12 w-12 object-contain" />
            <div>
              <p className="h-display text-lg leading-tight text-ink">{COMPANY.brand}</p>
              <p className="text-xs leading-tight text-ink/55">
                and Property Management
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
          {COMPANY.name}
        </footer>
      </article>

      {/* Anexos + download combinado (recibos). Escondido na impressão. */}
      <div className="mx-auto max-w-3xl">
        <InvoiceDocuments
          invoiceId={invoice.id}
          attachments={invoice.attachments ?? []}
          canManage={isSeasonal ? seasonalAccess : serviceAccess}
          addAction={addInvoiceAttachmentAction}
          deleteAction={deleteInvoiceAttachmentAction}
        />
      </div>

      {/* Print CSS: a impressão mostra só a folha do invoice (oculta sidebar/botões). */}
      <style>{`
        @media print {
          @page { margin: 16mm; }
          html, body { background: #fff !important; }
          aside, .print-hide { display: none !important; }
          main { padding: 0 !important; }
          /* O wrapper de conteúdo do painel (max-w-6xl, centralizado) não pode
             estreitar a folha na impressão. */
          main > div { max-width: none !important; margin: 0 !important; }
          #invoice-sheet {
            box-shadow: none !important;
            border: none !important;
            max-width: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Aumenta tudo pra preencher a folha (a fatura é curta — não pode ficar
             minúscula no topo de uma página em branco). */
          #invoice-sheet > header { margin-bottom: 3rem !important; padding-bottom: 2rem !important; }
          #invoice-sheet > header img { height: 64px !important; width: 64px !important; }
          /* Bloco Invoice to / Reservation maior e mais arejado. */
          #invoice-sheet .mb-6 { margin-bottom: 3rem !important; }
          #invoice-sheet .mb-6 .text-sm { font-size: 16px !important; line-height: 1.8 !important; }

          /* As duas tabelas (Paid by Guest / Owner) lado a lado, largura inteira,
             maiores e com mais respiro. */
          #invoice-sheet .seasonal-cols {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 2.5rem !important;
            width: 100% !important;
          }
          #invoice-sheet .seasonal-cols > div {
            padding: 2rem !important;
            break-inside: avoid;
          }
          #invoice-sheet .seasonal-cols h3 { font-size: 1.25rem !important; margin-bottom: 1.25rem !important; }
          #invoice-sheet .seasonal-cols .text-sm { font-size: 16px !important; }
          #invoice-sheet .seasonal-cols .text-sm > div { padding: 8px 0 !important; }
          #invoice-sheet .seasonal-cols .text-base {
            font-size: 1.4rem !important;
            margin-top: 1.5rem !important;
            padding-top: 1.25rem !important;
          }

          /* Notes + rodapé empurrados pro fim da página. */
          #invoice-sheet > div:last-of-type { font-size: 15px !important; }
          #invoice-sheet > footer { margin-top: 3.5rem !important; padding-top: 1.75rem !important; font-size: 12px !important; }
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
      <div className="seasonal-cols grid grid-cols-1 gap-6 sm:grid-cols-2">
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
          commissionBasis={commissionBasisLabel(invoice)}
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
  commissionBasis,
}: {
  title: string;
  items: InvoiceItem[];
  totalLabel: string;
  totalValue: number;
  accent: "primary" | "secondary";
  commission?: number | null;
  commissionBasis?: string | null;
}) {
  return (
    <div className="rounded-xl border border-black/[0.07] bg-black/[0.012] p-5">
      <h3 className="h-display mb-3 text-sm text-ink">{title}</h3>
      <div className="space-y-1.5 text-sm">
        {items.map((it) => {
          const isCommission = it.description.startsWith("By the C Commission");
          return (
            <div key={it.id} className="flex justify-between gap-3 text-ink/75">
              <span>
                {it.description}
                {isCommission && commissionBasis && (
                  <span className="ml-1 text-xs text-ink/40">({commissionBasis})</span>
                )}
              </span>
              <span className={it.total < 0 ? "text-ink/55" : "text-ink/85"}>{money(it.total)}</span>
            </div>
          );
        })}
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
