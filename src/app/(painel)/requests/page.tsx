import { createClient } from "@/lib/supabase/server";
import { PageHeader, NoAccess, Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import type { TenantRequest } from "@/lib/types";
import { operatorNameMap } from "@/lib/operators";
import { RequestsTable, type RequestRow, type RequestPropertyOption } from "./RequestsTable";
import { addRequestAction } from "../propriedades/actions";

export const dynamic = "force-dynamic";

async function load() {
  try {
    const supabase = createClient();
    const [{ data, error }, { data: propData }] = await Promise.all([
      supabase
        .from("tenant_requests")
        .select(
          "id, date, description, status, done_at, created_at, created_by, property:property_id(id,address), tenant:tenant_id(id,name)"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("properties")
        .select("id, address, address2")
        .is("archived_at", null)
        .order("address", { ascending: true }),
    ]);
    if (error) throw error;
    const names = await operatorNameMap(supabase);
    return {
      ok: true as const,
      requests: (data ?? []) as unknown as TenantRequest[],
      properties: (propData ?? []) as RequestPropertyOption[],
      names,
    };
  } catch {
    return {
      ok: false as const,
      requests: [] as TenantRequest[],
      properties: [] as RequestPropertyOption[],
      names: new Map<string, string>(),
    };
  }
}

export default async function RequestsPage() {
  const profile = await getProfile();
  if (!can(profile, "operations.edit")) {
    return (
      <>
        <PageHeader title="Tenant Requests" />
        <NoAccess />
      </>
    );
  }

  const { ok, requests, properties, names } = await load();
  const canEdit = can(profile, "operations.edit");

  const rows: RequestRow[] = requests.map((r) => ({
    id: r.id,
    date: r.date,
    description: r.description,
    status: r.status,
    property_address: r.property?.address ?? null,
    tenant_name: r.tenant?.name ?? null,
    created_by_name: r.created_by ? names.get(r.created_by) ?? null : null,
  }));

  return (
    <>
      <PageHeader
        title="Tenant Requests"
        subtitle="Maintenance and service requests reported by tenants."
      />

      {!ok && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06] text-sm text-ink/70">
          Database not connected. Check the environment variables{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </Card>
      )}

      <RequestsTable
        rows={rows}
        canEdit={canEdit}
        properties={properties}
        addAction={addRequestAction}
      />
    </>
  );
}
