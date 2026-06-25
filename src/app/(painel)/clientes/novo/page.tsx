import { PageHeader, NoAccess } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";
import type { Realtor } from "@/lib/types";
import { ClienteForm } from "../ClienteForm";
import { createClienteAction } from "../actions";

export const dynamic = "force-dynamic";

async function loadRealtors(): Promise<Realtor[]> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("realtors")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true });
    return (data ?? []) as Realtor[];
  } catch {
    return [];
  }
}

export default async function NovoClientePage() {
  const profile = await getProfile();
  if (!can(profile, "clients.edit")) {
    return (
      <>
        <PageHeader title="New client" />
        <NoAccess />
      </>
    );
  }

  const realtors = await loadRealtors();

  return (
    <>
      <PageHeader title="New client" subtitle="Client first. The property is attached to them afterward." />
      <ClienteForm action={createClienteAction} submitLabel="Create client" cancelHref="/clientes" realtors={realtors} />
    </>
  );
}
