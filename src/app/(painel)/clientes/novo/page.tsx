import { PageHeader, NoAccess } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { ClienteForm } from "../ClienteForm";
import { createClienteAction } from "../actions";

export const dynamic = "force-dynamic";

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

  return (
    <>
      <PageHeader title="New client" subtitle="Client first. The property is attached to them afterward." />
      <ClienteForm action={createClienteAction} submitLabel="Create client" cancelHref="/clientes" />
    </>
  );
}
