"use client";

// Aba "Inspections" do detalhe da propriedade: lista do MAIS NOVO pro mais antigo
// (data, Draft/Finished, quantos Needs attention, abrir, PDF) + "New inspection".
// Criar insere a inspeção + copia o checklist padrão e abre a tela da inspeção.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, FileText, Loader2, Plus, Settings2 } from "lucide-react";
import { Badge, EmptyState, buttonClass } from "@/components/ui";
import { cx } from "@/lib/format";
import { longDate } from "@/lib/inspections";
import { createInspectionAction } from "./inspections/actions";

export type InspectionSummary = {
  id: string;
  inspected_on: string;
  status: "draft" | "finished";
  attention: number;
  answered: number;
  total: number;
  hasPdf: boolean;
};

export function InspectionsSection({
  propertyId,
  inspections,
  canEdit,
  canEditChecklist,
}: {
  propertyId: string;
  inspections: InspectionSummary[];
  canEdit: boolean;
  canEditChecklist: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await createInspectionAction(propertyId);
      router.push(`/propriedades/${propertyId}/inspections/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the inspection.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {(canEdit || canEditChecklist) && (
        <div className="flex flex-wrap items-center gap-3">
          {canEdit && (
            <button type="button" onClick={() => void create()} disabled={busy} className={cx(buttonClass("primary"), "disabled:opacity-60")}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} New inspection
            </button>
          )}
          {canEditChecklist && (
            <Link href="/propriedades/inspection-checklist" className={buttonClass("ghost")}>
              <Settings2 className="h-4 w-4" /> Edit checklist
            </Link>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {inspections.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-6 w-6" />}
          title="No inspections"
          message="Start an inspection on your phone at the property. The finished report is saved here and in Documents as a PDF."
        />
      ) : (
        <ul className="divide-y divide-black/[0.06] rounded-2xl border border-black/[0.08] bg-white shadow-card">
          {inspections.map((i) => {
            const href = `/propriedades/${propertyId}/inspections/${i.id}`;
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <Link href={href} className="text-sm font-semibold text-ink hover:text-primary">
                    {longDate(i.inspected_on)}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/55">
                    <Badge tone={i.status === "finished" ? "gold" : "neutral"}>
                      {i.status === "finished" ? "Finished" : "Draft"}
                    </Badge>
                    {i.status === "draft" && (
                      <span>
                        {i.answered}/{i.total} answered
                      </span>
                    )}
                    {i.attention > 0 ? (
                      <Badge tone="tangerine">{i.attention} needs attention</Badge>
                    ) : (
                      i.status === "finished" && <span>No items need attention</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {i.status === "finished" && i.hasPdf && (
                    <a
                      href={`${href}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cx(buttonClass("ghost"), "px-3 py-1.5 text-xs")}
                    >
                      <FileText className="h-3.5 w-3.5" /> PDF
                    </a>
                  )}
                  <Link href={href} className={cx(buttonClass("ghost"), "px-3 py-1.5 text-xs")}>
                    {i.status === "draft" && canEdit ? "Continue" : "Open"}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
