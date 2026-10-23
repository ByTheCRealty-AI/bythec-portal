// =============================================================================
// /propriedades/inspection-checklist — checklist PADRÃO da inspeção.
// =============================================================================
// Owner/manager: adicionar, renomear, desativar e reordenar itens por seção.
// Vale só pra inspeções NOVAS (cada inspeção guarda a própria cópia).
// =============================================================================

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/session";
import { PageHeader, NoAccess } from "@/components/ui";
import type { InspectionTemplateItem } from "@/lib/inspections";
import { ChecklistClient } from "./ChecklistClient";

export const dynamic = "force-dynamic";

export default async function InspectionChecklistPage() {
  const profile = await getProfile();
  const allowed = !!profile && profile.active && (profile.role === "owner" || profile.role === "manager");
  if (!allowed) {
    return (
      <>
        <PageHeader title="Inspection checklist" />
        <NoAccess message="Only the owner or a manager can edit the inspection checklist." />
      </>
    );
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("inspection_template_items")
    .select("id, section, label, position, active, created_at")
    .order("position", { ascending: true });
  const items = (data ?? []) as unknown as InspectionTemplateItem[];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/propriedades"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/55 transition hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to properties
      </Link>
      <PageHeader
        title="Inspection checklist"
        subtitle="The default items for new inspections. Changes apply to new inspections only."
      />
      <ChecklistClient items={items} />
    </div>
  );
}
