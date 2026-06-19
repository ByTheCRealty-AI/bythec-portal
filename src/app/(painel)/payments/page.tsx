import { UnderConstruction } from "@/components/UnderConstruction";
import { PageHeader, NoAccess } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";

export const dynamic = "force-dynamic";

export default async function Page() {
  const profile = await getProfile();
  if (!can(profile, "payments.annual") && !can(profile, "financials.full")) {
    return (
      <>
        <PageHeader title="Payments" />
        <NoAccess />
      </>
    );
  }
  return <UnderConstruction title="Payments" phase="Cash basis (10% year-round) · Wave 2 / Phase 1" />;
}
