import { UnderConstruction } from "@/components/UnderConstruction";
import { PageHeader, NoAccess } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";

export const dynamic = "force-dynamic";

export default async function Page() {
  const profile = await getProfile();
  if (!can(profile, "operations.edit")) {
    return (
      <>
        <PageHeader title="Listings" />
        <NoAccess />
      </>
    );
  }
  return <UnderConstruction title="Listings" phase="Public website listings · Wave 2 / Phase 3" />;
}
