import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, NoAccess, Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { FileText } from "lucide-react";
import type { Invoice } from "@/lib/types";
import { InvoicesTable, type InvoiceRow } from "./InvoicesTable";
import { NewInvoiceButton } from "./NewInvoiceButton";

export const dynamic = "force-dynamic";

async function load() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, kind, platform, date, paid, total_paid_by_guest, labor_total, material_total, client:client_id(id,name), property:property_id(id,address)"
      )
      .is("archived_at", null)
      .order("invoice_number", { ascending: false });
    if (error) throw error;
    return { ok: true as const, invoices: (data ?? []) as unknown as Invoice[] };
  } catch {
    return { ok: false as const, invoices: [] as Invoice[] };
  }
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: { filter?: string; q?: string };
}) {
  const profile = await getProfile();
  const full = can(profile, "financials.full");
  const serviceOnly = !full && can(profile, "invoices.service");

  if (!full && !serviceOnly) {
    return (
      <>
        <PageHeader title="Invoices" />
        <NoAccess />
      </>
    );
  }

  const { ok, invoices } = await load();

  // Service-only users (secretary) só veem invoices de serviço. O RLS já filtra
  // no banco; reforçamos no app por clareza/defesa.
  const visible = serviceOnly ? invoices.filter((i) => i.kind === "service") : invoices;

  const rows: InvoiceRow[] = visible.map((i) => ({
    id: i.id,
    invoice_number: i.invoice_number,
    kind: i.kind,
    platform: i.platform,
    date: i.date,
    paid: i.paid,
    total:
      i.kind === "seasonal"
        ? i.total_paid_by_guest ?? 0
        : (i.labor_total ?? 0) + (i.material_total ?? 0),
    client_name: i.client?.name ?? null,
    property_address: i.property?.address ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle={
          serviceOnly
            ? "Service invoices for maintenance and long-term work."
            : "Seasonal (Airbnb / VRBO) and service invoices."
        }
        action={<NewInvoiceButton canSeasonal={full} />}
      />

      {!ok && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06] text-sm text-ink/70">
          Database not connected. Check the environment variables{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-primary">SUPABASE_SERVICE_ROLE_KEY</code>.
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No invoices yet"
          message={
            serviceOnly
              ? "Create the first service invoice for a maintenance job."
              : "Create the first invoice. Seasonal follows the locked Airbnb / VRBO formula."
          }
          cta={<NewInvoiceButton canSeasonal={full} />}
        />
      ) : (
        <InvoicesTable
          rows={rows}
          canSeasonal={full}
          initialFilter={searchParams.filter ?? ""}
          initialQuery={searchParams.q ?? ""}
        />
      )}
    </>
  );
}
