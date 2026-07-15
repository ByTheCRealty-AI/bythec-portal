import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, NoAccess, Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { Hammer } from "lucide-react";
import type { RequestStatus } from "@/lib/types";
import { ServicesTable, type ServiceListRow } from "./ServicesTable";

export const dynamic = "force-dynamic";

// Serviço cru vindo do banco (com os joins de property + provider).
type RawService = {
  id: string;
  property_id: string;
  service_request_date: string | null;
  description: string | null;
  status: RequestStatus;
  done_at: string | null;
  price: number | null;
  created_at: string;
  property?: { id: string; address: string; address2: string | null } | null;
  provider?: { id: string; name: string } | null;
};

// TODOS os serviços de TODAS as propriedades (active + done). RLS = operations.edit,
// então internos veem tudo; realtor (sem operations.edit) não acessa esta tela.
async function load() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("services")
      .select(
        "id, property_id, service_request_date, description, status, done_at, price, created_at, property:property_id(id, address, address2), provider:provider_id(id, name)"
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { ok: true as const, services: (data ?? []) as unknown as RawService[] };
  } catch {
    return { ok: false as const, services: [] as RawService[] };
  }
}

export default async function ServicesPage() {
  const profile = await getProfile();
  if (!can(profile, "operations.edit")) {
    return (
      <>
        <PageHeader title="Services" />
        <NoAccess />
      </>
    );
  }

  const { ok, services } = await load();

  const rows: ServiceListRow[] = services.map((s) => ({
    id: s.id,
    date: s.service_request_date,
    property_id: s.property?.id ?? s.property_id,
    property_address: s.property?.address ?? null,
    property_address2: s.property?.address2 ?? null,
    provider_name: s.provider?.name ?? null,
    description: s.description,
    status: s.status,
    done_at: s.done_at,
    price: s.price,
  }));

  return (
    <>
      <PageHeader
        title="Services"
        subtitle="Every service across all properties — active and done."
      />

      {!ok && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06] text-sm text-ink/70">
          Database not connected. Check the environment variables{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Hammer className="h-6 w-6" />}
          title="No services yet"
          message="Services logged on any property show up here — filter by active or done."
        />
      ) : (
        <ServicesTable rows={rows} />
      )}
    </>
  );
}
