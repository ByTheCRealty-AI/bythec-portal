import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, NoAccess, Card, buttonClass } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { FileText, Plus } from "lucide-react";
import type { Invoice } from "@/lib/types";
import { InvoicesTable, type InvoiceRow } from "./InvoicesTable";
import { NewInvoiceButton } from "./NewInvoiceButton";

// Escopo vindo da sub-categoria da sidebar. "all" = página /invoices legada.
export type InvoiceScope = "all" | "general" | "seasonal" | "service";

const COPY: Record<InvoiceScope, { title: string; subtitle: string }> = {
  all: { title: "Invoices", subtitle: "Seasonal (Airbnb / VRBO) and service invoices." },
  general: {
    title: "General Invoices",
    subtitle: "One-off charges (description + amount). No worker cost or commission.",
  },
  seasonal: {
    title: "Seasonal Invoices",
    subtitle: "Airbnb / VRBO stays. Locked owner-payout formula, per-property commission.",
  },
  service: {
    title: "Service Invoices",
    subtitle: "Maintenance / long-term work. Worker cost + your 10%, with 5-state tracking.",
  },
};

async function load() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, kind, platform, date, paid, cleaner_paid, cleaning_goes_to, total_paid_by_guest, labor_total, material_total, general_total, sent_to_owner, labor_paid, material_paid, commission_collected, client:client_id(id,name), property:property_id(id,address,address2)"
      )
      .is("archived_at", null)
      .order("invoice_number", { ascending: false });
    if (error) throw error;
    return { ok: true as const, invoices: (data ?? []) as unknown as Invoice[] };
  } catch {
    return { ok: false as const, invoices: [] as Invoice[] };
  }
}

export async function InvoicesIndex({
  scope,
  searchParams,
}: {
  scope: InvoiceScope;
  searchParams: { filter?: string; q?: string };
}) {
  const profile = await getProfile();
  const full = can(profile, "financials.full");
  const seasonalAccess = full || can(profile, "invoices.seasonal");
  const serviceAccess = full || can(profile, "invoices.service");
  const generalAccess = full || can(profile, "invoices.general");
  const copy = COPY[scope];

  if (!seasonalAccess && !serviceAccess && !generalAccess) {
    return (
      <>
        <PageHeader title={copy.title} />
        <NoAccess />
      </>
    );
  }
  // Acesso por sub-categoria (a sidebar já esconde as que a pessoa não pode ver,
  // mas reforçamos aqui contra acesso direto por URL).
  if (scope === "seasonal" && !seasonalAccess) {
    return (<><PageHeader title={copy.title} /><NoAccess /></>);
  }
  if (scope === "service" && !serviceAccess) {
    return (<><PageHeader title={copy.title} /><NoAccess /></>);
  }
  if (scope === "general" && !generalAccess) {
    return (<><PageHeader title={copy.title} /><NoAccess /></>);
  }

  const { ok, invoices } = await load();

  const serviceOnly = serviceAccess && !seasonalAccess;
  // Filtra por acesso E pelo escopo da sub-categoria.
  const visible = invoices.filter((i) => {
    const allowed =
      (i.kind === "seasonal" && seasonalAccess) ||
      (i.kind === "service" && serviceAccess) ||
      (i.kind === "general" && generalAccess);
    if (!allowed) return false;
    if (scope === "seasonal") return i.kind === "seasonal";
    if (scope === "service") return i.kind === "service";
    if (scope === "general") return i.kind === "general";
    return true; // all
  });

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
        : i.kind === "general"
        ? i.general_total ?? 0
        : (i.labor_total ?? 0) + (i.material_total ?? 0),
    client_name: i.client?.name ?? null,
    property_address: i.property
      ? i.property.address + (i.property.address2 ? ` · ${i.property.address2}` : "")
      : null,
    cleaner_unpaid: i.kind === "seasonal" && i.cleaning_goes_to === "bythec" && !i.cleaner_paid,
    sent: i.kind === "service" ? i.sent_to_owner : null,
    labor_paid: i.kind === "service" ? i.labor_paid : null,
    material_paid: i.kind === "service" ? i.material_paid : null,
    commission_collected: i.kind === "service" ? i.commission_collected : null,
  }));

  // Botão "New" por escopo: general/service vão direto; all/seasonal usam o menu.
  const newButton =
    scope === "general" ? (
      <Link href="/invoices/novo/geral" className={buttonClass("primary")}>
        <Plus className="h-4 w-4" /> New general invoice
      </Link>
    ) : scope === "service" ? (
      <NewInvoiceButton canSeasonal={false} />
    ) : (
      <NewInvoiceButton canSeasonal={seasonalAccess} />
    );

  const tableScope = scope === "all" ? "all" : scope;

  const emptyMsg =
    scope === "service"
      ? "Create the first service invoice for a maintenance job."
      : scope === "seasonal"
      ? "Create the first seasonal invoice — it follows the locked Airbnb / VRBO formula."
      : scope === "general"
      ? "Create the first general invoice — a simple one-off charge."
      : serviceOnly
      ? "Create the first service invoice for a maintenance job."
      : "Create the first invoice. Seasonal follows the locked Airbnb / VRBO formula.";

  return (
    <>
      <PageHeader title={copy.title} subtitle={copy.subtitle} action={newButton} />

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
          title={scope === "all" ? "No invoices yet" : `No ${copy.title.toLowerCase()} yet`}
          message={emptyMsg}
          cta={newButton}
        />
      ) : (
        <InvoicesTable
          rows={rows}
          canSeasonal={seasonalAccess}
          scope={tableScope as "all" | "seasonal" | "service" | "general"}
          initialFilter={searchParams.filter ?? ""}
          initialQuery={searchParams.q ?? ""}
        />
      )}
    </>
  );
}
