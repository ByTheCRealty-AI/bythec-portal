import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ClienteForm } from "../../ClienteForm";
import { updateClienteAction } from "../../actions";
import type { Client, Realtor } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditarClientePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data, error }, { data: realtorData }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", params.id).single(),
    supabase.from("realtors").select("*").eq("active", true).order("name", { ascending: true }),
  ]);
  if (error || !data) notFound();
  const client = data as Client;
  const realtors = (realtorData ?? []) as Realtor[];

  // Bind do id no server action (closure).
  const action = updateClienteAction.bind(null, client.id);

  return (
    <>
      <PageHeader title={`Edit — ${client.name}`} subtitle="Editing never erases history." />
      <ClienteForm client={client} action={action} submitLabel="Save changes" cancelHref={`/clientes/${client.id}`} realtors={realtors} />
    </>
  );
}
