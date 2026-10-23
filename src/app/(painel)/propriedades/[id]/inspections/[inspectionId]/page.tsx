// =============================================================================
// /propriedades/[id]/inspections/[inspectionId] — tela da INSPEÇÃO (mobile-first).
// =============================================================================
// Rascunho -> InspectionClient (checklist com autosave, fotos/vídeos, Finish).
// Finalizada -> InspectionFinished (resumo, PDF, Send to owner, aprovação do dono
// e "Create service" nos itens aprovados).
// maxDuration 60: o Finish gera o PDF com as fotos (as actions herdam o segmento).
// =============================================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { NoAccess } from "@/components/ui";
import { fullAddress, loadInspectionBundle } from "@/lib/inspection-server";
import { InspectionClient } from "./InspectionClient";
import { InspectionFinished } from "./InspectionFinished";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function InspectionPage({
  params,
}: {
  params: { id: string; inspectionId: string };
}) {
  const profile = await getProfile();
  const canView =
    can(profile, "properties.edit") || can(profile, "operations.edit") || can(profile, "properties.own");
  if (!canView) return <NoAccess />;
  const canEdit = can(profile, "properties.edit") || can(profile, "operations.edit");
  const canCreateService = can(profile, "operations.edit");

  const supabase = createClient();
  const bundle = await loadInspectionBundle(supabase, params.inspectionId);
  if (!bundle || bundle.inspection.property_id !== params.id) notFound();

  // Miniaturas: URLs assinadas (bucket privado), 1 h.
  const urls: Record<string, string> = {};
  const storagePaths = bundle.media.map((m) => m.storage_path);
  if (storagePaths.length > 0) {
    const { data: signed } = await supabase.storage.from("documents").createSignedUrls(storagePaths, 60 * 60);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
    }
  }

  const property = {
    id: bundle.property.id,
    address: fullAddress(bundle.property),
    ownerName: bundle.property.owner?.name ?? null,
    ownerEmail: bundle.property.owner?.email ?? null,
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href={`/propriedades/${params.id}?tab=inspections`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/55 transition hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to property
      </Link>
      {bundle.inspection.status === "finished" ? (
        <InspectionFinished
          inspection={bundle.inspection}
          property={property}
          items={bundle.items}
          media={bundle.media}
          urls={urls}
          canEdit={canEdit}
          canCreateService={canCreateService}
        />
      ) : canEdit ? (
        <InspectionClient
          inspection={bundle.inspection}
          property={property}
          items={bundle.items}
          media={bundle.media}
          urls={urls}
        />
      ) : (
        <NoAccess message="This inspection is still a draft. Only people who edit properties can work on it." />
      )}
    </div>
  );
}
