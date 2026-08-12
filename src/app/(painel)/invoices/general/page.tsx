import { InvoicesIndex } from "../InvoicesIndex";

export const dynamic = "force-dynamic";

export default function GeneralInvoicesPage({
  searchParams,
}: {
  searchParams: { filter?: string; q?: string };
}) {
  return <InvoicesIndex scope="general" searchParams={searchParams} />;
}
