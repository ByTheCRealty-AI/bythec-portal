import { InvoicesIndex } from "../InvoicesIndex";

export const dynamic = "force-dynamic";

export default function SeasonalInvoicesPage({
  searchParams,
}: {
  searchParams: { filter?: string; q?: string };
}) {
  return <InvoicesIndex scope="seasonal" searchParams={searchParams} />;
}
