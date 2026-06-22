import { createClient } from "@/lib/supabase/server";
import { PageHeader, NoAccess } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { createSeasonalInvoice } from "../../actions";
import { SeasonalInvoiceForm } from "../../SeasonalInvoiceForm";
import type { Client, Property } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewSeasonalInvoicePage() {
  const profile = await getProfile();
  // Seasonal exige financials.full (RLS confirma).
  if (!can(profile, "financials.full")) {
    return (
      <>
        <PageHeader title="New seasonal invoice" />
        <NoAccess message="Seasonal invoices require full financial access." />
      </>
    );
  }

  const supabase = createClient();
  const [{ data: clientsData }, { data: propsData }] = await Promise.all([
    supabase.from("clients").select("*").is("archived_at", null).order("name"),
    supabase
      .from("properties")
      .select("id, owner_id, address, address2, seasonal_commission_rate, seasonal_commission_base")
      .is("archived_at", null)
      .order("address"),
  ]);

  return (
    <>
      <PageHeader
        title="New seasonal invoice"
        subtitle="Airbnb / VRBO reservation. Locked owner-payout formula."
      />
      <SeasonalInvoiceForm
        action={createSeasonalInvoice}
        clients={(clientsData ?? []) as Client[]}
        properties={(propsData ?? []) as Pick<Property, "id" | "owner_id" | "address" | "address2" | "seasonal_commission_rate" | "seasonal_commission_base">[]}
      />
    </>
  );
}
