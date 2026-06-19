import { UnderConstruction } from "@/components/UnderConstruction";
import { PageHeader, NoAccess } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";

export const dynamic = "force-dynamic";

export default async function Page() {
  const profile = await getProfile();
  if (!can(profile, "invoices.service") && !can(profile, "financials.full")) {
    return (
      <>
        <PageHeader title="Invoices" />
        <NoAccess />
      </>
    );
  }
  return <UnderConstruction title="Invoices" phase="Formula locked in bythec-mcp · Wave 2 / Phase 1" />;
}
