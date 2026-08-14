// =============================================================================
// /applications — triagem interna das aplicações de aluguel públicas.
// =============================================================================
// Gated por applications.manage (owner + manager). Lista mais recentes primeiro.
// NUNCA seleciona ssn_encrypted — o SSN só é decifrado sob demanda via action.
// =============================================================================

import { createClient } from "@/lib/supabase/server";
import { PageHeader, NoAccess, EmptyState } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { ClipboardList } from "lucide-react";
import type { RentalApplication } from "@/lib/types";
import { ApplicationsClient } from "./ApplicationsClient";

export const dynamic = "force-dynamic";

const COLUMNS =
  "id, language, status, property_id, property_other, full_name, date_of_birth, has_ssn, ssn_last4, ssn_none_explanation, phone, has_license, drivers_license, drivers_license_state, gov_id_type, gov_id_number, email, occupants_count, occupants, rental_history, vehicles, employer, employer_address, manager_name, manager_phone, job_title, monthly_income, length_of_employment, personal_references, evicted, evicted_detail, felony, felony_detail, bankruptcy, bankruptcy_detail, smokes, has_pets, pets_detail, reason_for_moving, consent_agreed, signature_name, signature_date, signature_name_2, signature_date_2, consent_ip, fee_amount, payment_status, paid_at, internal_notes, ssn_last_revealed_at, archived_at, submitted_at, created_at, property:property_id(id,address,address2), attachments:rental_application_attachments(id, application_id, category, occupant_index, label, file_path, file_name, content_type, created_at)";

async function load() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("rental_applications")
      .select(COLUMNS)
      .is("archived_at", null)
      .order("submitted_at", { ascending: false });
    if (error) throw error;
    return { ok: true as const, applications: (data ?? []) as unknown as RentalApplication[] };
  } catch {
    return { ok: false as const, applications: [] as RentalApplication[] };
  }
}

export default async function ApplicationsPage() {
  const profile = await getProfile();
  if (!can(profile, "applications.manage")) {
    return (
      <>
        <PageHeader title="Rental Applications" />
        <NoAccess />
      </>
    );
  }

  const { applications } = await load();

  return (
    <>
      <PageHeader
        title="Rental Applications"
        subtitle="Applications submitted from the website. Newest first."
      />
      {applications.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="No applications yet"
          message="When someone applies for a rental on the website, it will show up here."
        />
      ) : (
        <ApplicationsClient applications={applications} />
      )}
    </>
  );
}
