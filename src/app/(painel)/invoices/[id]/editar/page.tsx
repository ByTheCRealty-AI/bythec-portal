import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { PageHeader, NoAccess } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { updateSeasonalInvoice, updateServiceInvoice } from "../../actions";
import { SeasonalInvoiceForm } from "../../SeasonalInvoiceForm";
import { ServiceInvoiceForm } from "../../ServiceInvoiceForm";
import type { Client, Invoice, InvoiceItem, Property, InvoiceItemCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

// Descrições padrão geradas pela fórmula — usadas pra separar os EXTRAS (que o
// usuário digitou) dos itens calculados, ao reconstruir o form de edição.
const STD_GUEST = new Set([
  "Rental Nights",
  "Rental Discount",
  "Cleaning Fee",
  "Guest Service Fee",
  "Occupancy Taxes",
  "Lodging Taxes",
  "Property Damage Protection",
]);
const STD_OWNER = new Set([
  "Host Payout",
  "Platform Host Service Fee",
  "Cleaning Fee (By the C)",
  "By the C Commission",
]);

export default async function EditInvoicePage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  const full = can(profile, "financials.full");
  const seasonalAccess = full || can(profile, "invoices.seasonal");
  const serviceAccess = full || can(profile, "invoices.service");
  if (!seasonalAccess && !serviceAccess) {
    return (
      <>
        <PageHeader title="Edit invoice" />
        <NoAccess />
      </>
    );
  }

  const supabase = createClient();
  const [{ data, error }, { data: clientsData }, { data: propsData }] = await Promise.all([
    supabase.from("invoices").select("*, items:invoice_items(*)").eq("id", params.id).single(),
    supabase.from("clients").select("*").is("archived_at", null).order("name"),
    supabase
      .from("properties")
      .select("id, owner_id, address, address2, seasonal_commission_rate, seasonal_commission_base")
      .is("archived_at", null)
      .order("address"),
  ]);
  if (error || !data) notFound();

  const invoice = data as unknown as Invoice & { items: InvoiceItem[] };
  const isSeasonal = invoice.kind === "seasonal";
  if (isSeasonal && !seasonalAccess) redirect("/invoices");
  if (!isSeasonal && !serviceAccess) redirect("/invoices");

  const clients = (clientsData ?? []) as Client[];
  const properties = (propsData ?? []) as Pick<
    Property,
    "id" | "owner_id" | "address" | "address2" | "seasonal_commission_rate" | "seasonal_commission_base"
  >[];
  const items = invoice.items ?? [];

  const numberLabel = isSeasonal
    ? `Invoice #${invoice.invoice_number}`
    : `Service Invoice #${invoice.invoice_number}`;

  if (isSeasonal) {
    // Reconstrói os EXTRAS (não-padrão) a partir dos itens salvos.
    const initialGuestExtras = items
      .filter((it) => it.guest && !STD_GUEST.has(it.description))
      .map((it) => ({ description: it.description, amount: String(it.total) }));
    const initialExtras = items
      .filter((it) => it.owner && !STD_OWNER.has(it.description))
      .map((it) => ({ description: it.description, amount: String(Math.abs(it.total)) }));

    return (
      <>
        <PageHeader
          title={`Edit — ${numberLabel}`}
          subtitle="Seasonal · totals recompute with the locked formula on save."
        />
        <SeasonalInvoiceForm
          action={updateSeasonalInvoice.bind(null, invoice.id)}
          clients={clients}
          properties={properties}
          invoice={invoice}
          initialExtras={initialExtras}
          initialGuestExtras={initialGuestExtras}
          submitLabel="Save changes"
          cancelHref={`/invoices/${invoice.id}`}
        />
      </>
    );
  }

  const initialItems = items.map((it) => ({
    description: it.description,
    amount: String(it.total),
    category: (it.category ?? "labor") as InvoiceItemCategory,
  }));

  return (
    <>
      <PageHeader title={`Edit — ${numberLabel}`} subtitle="Service · labor and material line items." />
      <ServiceInvoiceForm
        action={updateServiceInvoice.bind(null, invoice.id)}
        clients={clients}
        properties={properties}
        invoice={invoice}
        initialItems={initialItems}
        submitLabel="Save changes"
        cancelHref={`/invoices/${invoice.id}`}
      />
    </>
  );
}
