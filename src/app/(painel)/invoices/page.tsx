import { InvoicesIndex } from "./InvoicesIndex";

export const dynamic = "force-dynamic";

// /invoices = visão geral (todos os tipos). As sub-categorias da sidebar levam a
// /invoices/general | /invoices/seasonal | /invoices/service.
export default function InvoicesPage({
  searchParams,
}: {
  searchParams: { filter?: string; q?: string };
}) {
  return <InvoicesIndex scope="all" searchParams={searchParams} />;
}
