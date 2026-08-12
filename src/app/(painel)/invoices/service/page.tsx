import { InvoicesIndex } from "../InvoicesIndex";

export const dynamic = "force-dynamic";

export default function ServiceInvoicesPage({
  searchParams,
}: {
  searchParams: { filter?: string; q?: string };
}) {
  return <InvoicesIndex scope="service" searchParams={searchParams} />;
}
