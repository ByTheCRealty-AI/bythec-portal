import { PageHeader } from "@/components/ui";
import { ClienteForm } from "../ClienteForm";
import { createClienteAction } from "../actions";

export default function NovoClientePage() {
  return (
    <>
      <PageHeader title="New client" subtitle="Client first. The property is attached to them afterward." />
      <ClienteForm action={createClienteAction} submitLabel="Create client" cancelHref="/clientes" />
    </>
  );
}
