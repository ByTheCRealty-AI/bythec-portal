"use client";

// =============================================================================
// Inspeção FINALIZADA — somente leitura, exceto a aprovação do dono.
// =============================================================================
// - Resumo (good / needs attention / N/A / fotos+vídeos) e ações do PDF.
// - "Send to owner": não há backend de e-mail. Baixa o PDF E abre o compose do
//   Gmail (conta info@) com assunto/corpo prontos; a pessoa anexa e envia.
// - Needs attention: aprovação Pending owner OK -> Approved -> Declined (autosave).
//   "Create service" SÓ aparece em item Approved sem service, e SÓ cria no clique.
// =============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, Mail, Loader2, Wrench, CheckCircle2, AlertCircle, Paperclip } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { cx } from "@/lib/format";
import {
  APPROVAL_LABEL,
  RESULT_LABEL,
  groupBySection,
  longDate,
  nextApproval,
  type Inspection,
  type InspectionApproval,
  type InspectionItem,
  type InspectionMedia,
  type InspectionPropertyInfo,
} from "@/lib/inspections";
import { setItemApprovalAction, createServiceFromItemAction } from "../actions";
import { MediaThumb } from "./MediaThumb";

const APPROVAL_TONE: Record<InspectionApproval, string> = {
  pending: "border-amber-300 bg-amber-50 text-amber-800",
  approved: "border-primary/40 bg-primary/10 text-primary",
  declined: "border-black/15 bg-black/[0.04] text-ink/60",
};

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function InspectionFinished({
  inspection,
  property,
  items: initialItems,
  media,
  urls,
  canEdit,
  canCreateService,
}: {
  inspection: Inspection;
  property: InspectionPropertyInfo;
  items: InspectionItem[];
  media: InspectionMedia[];
  urls: Record<string, string>;
  canEdit: boolean;
  canCreateService: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<InspectionItem[]>(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const pdfHref = `/propriedades/${property.id}/inspections/${inspection.id}/pdf`;
  const when = longDate(inspection.inspected_on);

  const counts = useMemo(
    () => ({
      good: items.filter((i) => i.result === "good").length,
      attention: items.filter((i) => i.result === "attention").length,
      na: items.filter((i) => i.result === "na").length,
    }),
    [items]
  );
  const attentionItems = useMemo(
    () => groupBySection(items).flatMap((g) => g.items).filter((i) => i.result === "attention"),
    [items]
  );
  const mediaByItem = useMemo(() => {
    const map = new Map<string, InspectionMedia[]>();
    const sorted = [...media].sort((a, b) => b.created_at.localeCompare(a.created_at));
    for (const m of sorted) {
      const key = m.item_id ?? "__general__";
      const arr = map.get(key);
      if (arr) arr.push(m);
      else map.set(key, [m]);
    }
    return map;
  }, [media]);

  // ---- Send to owner (Gmail compose + download) --------------------------------
  function sendToOwner() {
    if (!property.ownerEmail) return;
    const subject = `Inspection Report – ${property.address} – ${when}`;
    const greeting = property.ownerName ? `Hello ${property.ownerName},` : "Hello,";
    const n = counts.attention;
    const attentionLine =
      n === 0
        ? "No items needed attention at the time of the inspection."
        : `${n} ${n === 1 ? "item needs" : "items need"} attention and ${n === 1 ? "is" : "are"} detailed in the report. Nothing will be scheduled without your approval, so please let us know how you would like us to proceed.`;
    const body = [
      greeting,
      "",
      `We completed a routine inspection of ${property.address} on ${when}. The full inspection report is attached for your records.`,
      "",
      attentionLine,
      "",
      "Please let us know if you have any questions.",
      "",
      "Best regards,",
      "By the C Realty & Property Management",
    ].join("\n");
    const url =
      "https://mail.google.com/mail/?authuser=" +
      encodeURIComponent("info@bythecrealty.com") +
      "&view=cm&fs=1&to=" +
      encodeURIComponent(property.ownerEmail) +
      "&su=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);
    // Abre o Gmail primeiro (ainda dentro do clique, sem bloqueio de pop-up) e
    // depois dispara o download do PDF pra anexar.
    window.open(url, "_blank", "noopener,noreferrer");
    const a = document.createElement("a");
    a.href = `${pdfHref}?download=1`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setSent(true);
  }

  // ---- Aprovação / service --------------------------------------------------------
  async function cycleApproval(item: InspectionItem) {
    const next = nextApproval(item.approval);
    const prev = item.approval;
    setError(null);
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, approval: next } : i)));
    try {
      await setItemApprovalAction(item.id, next);
    } catch (e) {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, approval: prev } : i)));
      setError(errMsg(e, "Could not save the approval."));
    }
  }

  async function createService(item: InspectionItem) {
    setError(null);
    setBusyId(item.id);
    try {
      const { serviceId } = await createServiceFromItemAction(item.id);
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, service_id: serviceId } : i)));
      router.refresh();
    } catch (e) {
      setError(errMsg(e, "Could not create the service."));
    } finally {
      setBusyId(null);
    }
  }

  const tile = (label: string, value: number, tone: string) => (
    <div className={cx("rounded-2xl border bg-white p-4 text-center shadow-card", tone)}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
    </div>
  );

  return (
    <div className="space-y-5 pb-10">
      {/* Cabeçalho */}
      <div className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Property inspection</p>
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            <CheckCircle2 className="h-3 w-3" /> Finished
          </span>
        </div>
        <h1 className="h-display mt-1 text-xl text-ink sm:text-2xl">{property.address}</h1>
        <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-ink/65 sm:grid-cols-3">
          <span>Owner: {property.ownerName ?? "—"}</span>
          <span>Date: {when}</span>
          <span>By: {inspection.inspected_by ?? "—"}</span>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tile("Good", counts.good, "border-primary/20 text-primary")}
        {tile("Needs attention", counts.attention, "border-orange-200 text-orange-700")}
        {tile("N/A", counts.na, "border-black/[0.08] text-ink/60")}
        {tile("Photos & videos", media.length, "border-black/[0.08] text-ink/75")}
      </div>

      {/* PDF */}
      <div className="space-y-3 rounded-2xl border border-black/[0.08] bg-white p-4 shadow-card">
        <h2 className="h-display text-base text-ink">Report PDF</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <a href={pdfHref} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost")}>
            <Eye className="h-4 w-4" /> View
          </a>
          <a href={`${pdfHref}?download=1`} className={buttonClass("ghost")}>
            <Download className="h-4 w-4" /> Download
          </a>
          <button
            type="button"
            onClick={sendToOwner}
            disabled={!property.ownerEmail}
            className={cx(buttonClass("primary"), "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100")}
          >
            <Mail className="h-4 w-4" /> Send to owner
          </button>
        </div>
        {!property.ownerEmail ? (
          <p className="text-xs text-ink/50">
            The owner has no email on file. Add one to the owner&apos;s client record to send the report.
          </p>
        ) : (
          <p className={cx("inline-flex items-center gap-1.5 text-xs", sent ? "font-semibold text-orange-700" : "text-ink/50")}>
            <Paperclip className="h-3.5 w-3.5" /> Attach the downloaded PDF before sending.
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Needs attention */}
      <section className="space-y-3">
        <h2 className="h-display px-1 text-base text-ink">Needs attention ({attentionItems.length})</h2>
        {attentionItems.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-black/[0.12] bg-black/[0.015] px-4 py-6 text-center text-sm text-ink/55">
            No items needed attention.
          </p>
        ) : (
          attentionItems.map((item) => {
            const approval: InspectionApproval = item.approval ?? "pending";
            const list = mediaByItem.get(item.id) ?? [];
            return (
              <div key={item.id} className="space-y-3 rounded-2xl border border-orange-200 bg-white p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink/45">{item.section}</p>
                    <p className="text-sm font-semibold text-ink">{item.label}</p>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => void cycleApproval(item)}
                      className={cx("rounded-full border px-3 py-1 text-xs font-semibold transition", APPROVAL_TONE[approval])}
                      title="Tap to change: Pending owner OK → Approved → Declined"
                    >
                      {APPROVAL_LABEL[approval]}
                    </button>
                  ) : (
                    <span className={cx("rounded-full border px-3 py-1 text-xs font-semibold", APPROVAL_TONE[approval])}>
                      {APPROVAL_LABEL[approval]}
                    </span>
                  )}
                </div>
                {item.note && <p className="whitespace-pre-wrap text-sm text-ink/80">{item.note}</p>}
                {list.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {list.map((m) => (
                      <div key={m.id} className="space-y-1">
                        <MediaThumb media={m} url={urls[m.storage_path] ?? null} />
                        <p className="text-[11px] leading-snug text-ink/65">{m.caption}</p>
                      </div>
                    ))}
                  </div>
                )}
                {item.service_id ? (
                  <Link
                    href={`/propriedades/${property.id}?tab=services`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Service created — see Services
                  </Link>
                ) : approval === "approved" && canCreateService ? (
                  <button
                    type="button"
                    onClick={() => void createService(item)}
                    disabled={busyId === item.id}
                    className={cx(buttonClass("ghost"), "disabled:opacity-60")}
                  >
                    {busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                    Create service
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </section>

      {/* Checklist completo (somente leitura) */}
      <section className="space-y-3">
        <h2 className="h-display px-1 text-base text-ink">Full checklist</h2>
        {groupBySection(items).map((g) => (
          <div key={g.section} className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-card">
            <p className="bg-primary/[0.06] px-4 py-2 text-sm font-semibold text-primary">{g.section}</p>
            <ul className="divide-y divide-black/[0.05]">
              {g.items.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="text-ink/85">{i.label}</p>
                    {i.note && <p className="text-xs text-ink/50">{i.note}</p>}
                  </div>
                  <span
                    className={cx(
                      "shrink-0 text-xs font-semibold",
                      i.result === "attention" ? "text-orange-700" : i.result === "good" ? "text-primary" : "text-ink/45"
                    )}
                  >
                    {i.result ? RESULT_LABEL[i.result] : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {(mediaByItem.get("__general__")?.length ?? 0) > 0 && (
        <section className="space-y-3 rounded-2xl border border-black/[0.08] bg-white p-4 shadow-card">
          <h2 className="h-display text-base text-ink">General photos and videos</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(mediaByItem.get("__general__") ?? []).map((m) => (
              <div key={m.id} className="space-y-1">
                <MediaThumb media={m} url={urls[m.storage_path] ?? null} />
                <p className="text-[11px] leading-snug text-ink/65">{m.caption}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(inspection.notes || inspection.recommendations) && (
        <section className="space-y-4 rounded-2xl border border-black/[0.08] bg-white p-4 shadow-card">
          {inspection.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Inspection notes and observations</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink/80">{inspection.notes}</p>
            </div>
          )}
          {inspection.recommendations && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Maintenance recommendations</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink/80">{inspection.recommendations}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
