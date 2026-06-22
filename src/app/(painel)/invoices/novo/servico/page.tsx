import { createClient } from "@/lib/supabase/server";
import { PageHeader, NoAccess } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { createServiceInvoice } from "../../actions";
import { ServiceInvoiceForm } from "../../ServiceInvoiceForm";
import type { Client, Property } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewServiceInvoicePage() {
  const profile = await getProfile();
  if (!can(profile, "financials.full") && !can(profile, "invoices.service")) {
    return (
      <>
        <PageHeader title="New service invoice" />
        <NoAccess />
      </>
    );
  }

  const supabase = createClient();
  const [{ data: clientsData }, { data: propsData }] = await Promise.all([
    supabase.from("clients").select("*").is("archived_at", null).order("name"),
    supabase
      .from("properties")
      .select("id, owner_id, address, address2, seasonal_commission_rate")
      .is("archived_at", null)
      .order("address"),
  ]);

  return (
    <>
      <PageHeader
        title="New service invoice"
        subtitle="Maintenance / long-term work. Labor + material line items."
      />
      <ServiceInvoiceForm
        action={createServiceInvoice}
        clients={(clientsData ?? []) as Client[]}
        properties={(propsData ?? []) as Pick<Property, "id" | "owner_id" | "address" | "address2" | "seasonal_commission_rate">[]}
      />
    </>
  );
}
