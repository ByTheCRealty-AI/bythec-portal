import { createClient } from "@/lib/supabase/server";
import { PageHeader, NoAccess } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { createGeneralInvoice } from "../../actions";
import { GeneralInvoiceForm } from "../../GeneralInvoiceForm";
import type { Client, Property } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewGeneralInvoicePage() {
  const profile = await getProfile();
  if (!can(profile, "financials.full") && !can(profile, "invoices.general")) {
    return (
      <>
        <PageHeader title="New general invoice" />
        <NoAccess />
      </>
    );
  }

  const supabase = createClient();
  const [{ data: clientsData }, { data: propsData }] = await Promise.all([
    supabase.from("clients").select("*").is("archived_at", null).order("name"),
    supabase
      .from("properties")
      .select("id, owner_id, address, address2")
      .is("archived_at", null)
      .order("address"),
  ]);

  return (
    <>
      <PageHeader
        title="New general invoice"
        subtitle="A simple one-off charge — description and amount. No worker cost or commission."
      />
      <GeneralInvoiceForm
        action={createGeneralInvoice}
        clients={(clientsData ?? []) as Client[]}
        properties={(propsData ?? []) as Pick<Property, "id" | "owner_id" | "address" | "address2">[]}
      />
    </>
  );
}
