import { createClient } from "@/lib/supabase/server";
import { PageHeader, NoAccess } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { PropriedadeNovoForm } from "../PropriedadeNovoForm";

export const dynamic = "force-dynamic";

export default async function NovaPropriedadePage() {
  const profile = await getProfile();
  if (!can(profile, "properties.edit")) {
    return (
      <>
        <PageHeader title="New property" />
        <NoAccess />
      </>
    );
  }

  // Owners pro picker: clientes ativos (não arquivados), ordenados por nome.
  const supabase = createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, name")
    .is("archived_at", null)
    .order("name", { ascending: true });
  const owners = (data ?? []) as { id: string; name: string }[];

  return (
    <>
      <PageHeader
        title="New property"
        subtitle="Pick the owner, then describe the home. A property always belongs to a client."
      />
      <PropriedadeNovoForm owners={owners} />
    </>
  );
}
