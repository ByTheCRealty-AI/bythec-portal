import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, NoAccess, Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { HardHat } from "lucide-react";
import type { ServiceProvider } from "@/lib/types";
import { ProvidersTable } from "./ProvidersTable";

export const dynamic = "force-dynamic";

async function load() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("service_providers")
      .select("id, name, service_type, phone, email, notify_via, notes, archived_at, created_at")
      .is("archived_at", null) // TRAVADO: lista filtra arquivados por padrão
      .order("name", { ascending: true });
    if (error) throw error;
    return { ok: true as const, providers: (data ?? []) as ServiceProvider[] };
  } catch {
    return { ok: false as const, providers: [] as ServiceProvider[] };
  }
}

export default async function ProvidersPage() {
  const profile = await getProfile();
  if (!can(profile, "operations.edit")) {
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

      {providers.length === 0 ? (
        <EmptyState
          icon={<HardHat className="h-6 w-6" />}
          title="No providers yet"
          message="Service providers appear here once they are added to the directory."
        />
      ) : (
        <ProvidersTable providers={providers} />
      )}
    </>
  );
}
