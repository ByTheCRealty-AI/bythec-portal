import { createClient } from "@/lib/supabase/server";
import { PageHeader, NoAccess, Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import type { ServiceProvider } from "@/lib/types";
import { ProvidersTable } from "./ProvidersTable";
import { createProviderAction, updateProviderAction, deleteProviderAction, togglePreferredAction } from "./actions";

export const dynamic = "force-dynamic";

async function load() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("service_providers")
      .select("id, name, service_type, phone, email, notify_via, notes, contact_person, contact_phone, preferred, archived_at, created_at")
      .is("archived_at", null) // TRAVADO: lista filtra arquivados por padrão
      .order("preferred", { ascending: false }) // starred no topo
      .order("name", { ascending: true });
    if (error) throw error;
    return { ok: true as const, providers: (data ?? []) as ServiceProvider[] };
  } catch {
    return { ok: false as const, providers: [] as ServiceProvider[] };
  }
}

export default async function ProvidersPage() {
  const profile = await getProfile();
  // operations.edit = internos (CRUD completo). providers.view = read-only (realtor
  // vê a lista compartilhada mas não cria/edita/apaga — canManage abaixo controla).
  if (!can(profile, "operations.edit") && !can(profile, "providers.view")) {
    return (
      <>
        <PageHeader title="Service Providers" />
        <NoAccess />
      </>
    );
  }

  const { ok, providers } = await load();

  return (
    <>
      <PageHeader
        title="Service Providers"
        subtitle="Vendors and contractors used for maintenance and services."
      />

      {!ok && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06] text-sm text-ink/70">
          Database not connected. Check the environment variables{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </Card>
      )}

      <ProvidersTable
        providers={providers}
        canManage={can(profile, "operations.edit")}
        createAction={createProviderAction}
        updateAction={updateProviderAction}
        deleteAction={deleteProviderAction}
        toggleAction={togglePreferredAction}
      />
    </>
  );
}
