import { redirect } from "next/navigation";
import { PageHeader, NoAccess } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";

export const dynamic = "force-dynamic";

// /invoices não é mais uma página própria — o item "Invoices" da sidebar é só um
// cabeçalho. Qualquer acesso direto cai na primeira sub-categoria que a pessoa
// pode ver (internos → Service; realtor → General).
export default async function InvoicesPage() {
  const profile = await getProfile();
  const full = can(profile, "financials.full");
  if (full || can(profile, "invoices.service")) redirect("/invoices/service");
  if (can(profile, "invoices.seasonal")) redirect("/invoices/seasonal");
  if (can(profile, "invoices.general")) redirect("/invoices/general");
  return (
    <>
      <PageHeader title="Invoices" />
      <NoAccess />
    </>
  );
}
