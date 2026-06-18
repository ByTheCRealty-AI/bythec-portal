import { PageHeader } from "@/components/ui";
import { ClienteForm } from "../ClienteForm";
import { createClienteAction } from "../actions";

export default function NovoClientePage() {
  return (
    <>
      <PageHeader title="Novo cliente" subtitle="Cliente primeiro. A propriedade pendura nele depois." />
      <ClienteForm action={createClienteAction} submitLabel="Criar cliente" cancelHref="/clientes" />
    </>
  );
}
