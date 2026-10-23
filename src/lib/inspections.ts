// =============================================================================
// By the C — Inspeção de propriedade (migration 0056) · tipos + regras compartilhadas
// =============================================================================
// Usado no servidor (actions, PDF) E no navegador (tela da inspeção), então NADA
// aqui pode ser server-only. A validação de "Finish" mora aqui pra que a tela e a
// server action apliquem EXATAMENTE a mesma regra (aprovada pela Andrea):
//   - todo item respondido (Good / Needs attention / N/A — nunca yes/no);
//   - Needs attention exige nota E pelo menos 1 foto/vídeo;
//   - TODA mídia (de item ou geral) exige legenda;
//   - Good NÃO exige mídia.
// =============================================================================

export type InspectionStatus = "draft" | "finished";
export type InspectionResult = "good" | "attention" | "na";
export type InspectionApproval = "pending" | "approved" | "declined";
export type InspectionMediaKind = "photo" | "video";

export interface Inspection {
  id: string;
  property_id: string;
  inspected_on: string; // YYYY-MM-DD
  inspected_by: string | null;
  status: InspectionStatus;
  notes: string | null;
  recommendations: string | null;
  pdf_document_id: string | null;
  created_by: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface InspectionItem {
  id: string;
  inspection_id: string;
  section: string;
  label: string;
  position: number;
  result: InspectionResult | null;
  note: string | null;
  approval: InspectionApproval | null;
  service_id: string | null;
  created_at: string;
}

export interface InspectionMedia {
  id: string;
  inspection_id: string;
  item_id: string | null;
  storage_path: string;
  kind: InspectionMediaKind;
  caption: string;
  position: number;
  created_at: string;
}

export interface InspectionTemplateItem {
  id: string;
  section: string;
  label: string;
  position: number;
  active: boolean;
  created_at: string;
}

// O que a tela da inspeção precisa da propriedade (montado no servidor).
export interface InspectionPropertyInfo {
  id: string;
  address: string; // endereço completo (+ unidade)
  ownerName: string | null;
  ownerEmail: string | null;
}

export const INSPECTION_COLUMNS =
  "id, property_id, inspected_on, inspected_by, status, notes, recommendations, pdf_document_id, created_by, created_at, finished_at";
export const INSPECTION_ITEM_COLUMNS =
  "id, inspection_id, section, label, position, result, note, approval, service_id, created_at";
export const INSPECTION_MEDIA_COLUMNS =
  "id, inspection_id, item_id, storage_path, kind, caption, position, created_at";

export const DEFAULT_INSPECTED_BY = "By the C Realty & Property Management";

export const RESULT_LABEL: Record<InspectionResult, string> = {
  good: "Good",
  attention: "Needs attention",
  na: "N/A",
};

export const APPROVAL_LABEL: Record<InspectionApproval, string> = {
  pending: "Pending owner OK",
  approved: "Approved",
  declined: "Declined",
};

// Ciclo do controle de aprovação: Pending -> Approved -> Declined -> Pending.
export function nextApproval(a: InspectionApproval | null): InspectionApproval {
  if (a === "approved") return "declined";
  if (a === "declined") return "pending";
  return "approved";
}

// Itens agrupados por seção. Ordem das seções = menor position de cada uma;
// dentro da seção, position e depois created_at (item extra entra no fim).
export function groupBySection<T extends { section: string; position: number; created_at: string }>(
  items: T[]
): { section: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const arr = map.get(it.section);
    if (arr) arr.push(it);
    else map.set(it.section, [it]);
  }
  const groups = Array.from(map.entries()).map(([section, list]) => ({
    section,
    items: [...list].sort(
      (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)
    ),
  }));
  groups.sort(
    (a, b) =>
      Math.min(...a.items.map((i) => i.position)) - Math.min(...b.items.map((i) => i.position)) ||
      a.section.localeCompare(b.section)
  );
  return groups;
}

export interface InspectionValidation {
  ok: boolean;
  itemErrors: Record<string, string[]>; // item id -> mensagens
  mediaErrors: Record<string, string>; // media id -> mensagem
  messages: string[]; // resumo pro topo/rodapé
}

export function validateInspection(
  items: Pick<InspectionItem, "id" | "label" | "section" | "result" | "note">[],
  media: Pick<InspectionMedia, "id" | "item_id" | "caption">[]
): InspectionValidation {
  const itemErrors: Record<string, string[]> = {};
  const mediaErrors: Record<string, string> = {};
  const push = (id: string, msg: string) => {
    (itemErrors[id] ??= []).push(msg);
  };

  const mediaCount = new Map<string, number>();
  for (const m of media) {
    if (m.item_id) mediaCount.set(m.item_id, (mediaCount.get(m.item_id) ?? 0) + 1);
    if (!m.caption || m.caption.trim() === "") mediaErrors[m.id] = "Add a caption.";
  }

  let unanswered = 0;
  let attentionIncomplete = 0;
  for (const it of items) {
    if (!it.result) {
      unanswered++;
      push(it.id, "Choose Good, Needs attention or N/A.");
      continue;
    }
    if (it.result === "attention") {
      const noNote = !it.note || it.note.trim() === "";
      const noMedia = (mediaCount.get(it.id) ?? 0) === 0;
      if (noNote) push(it.id, "A note is required for Needs attention.");
      if (noMedia) push(it.id, "Add at least one photo or video.");
      if (noNote || noMedia) attentionIncomplete++;
    }
  }

  const missingCaptions = Object.keys(mediaErrors).length;
  const messages: string[] = [];
  if (unanswered > 0)
    messages.push(`${unanswered} ${unanswered === 1 ? "item is" : "items are"} not answered yet.`);
  if (attentionIncomplete > 0)
    messages.push(
      `${attentionIncomplete} Needs attention ${attentionIncomplete === 1 ? "item needs" : "items need"} a note and at least one photo or video.`
    );
  if (missingCaptions > 0)
    messages.push(
      `${missingCaptions} ${missingCaptions === 1 ? "photo or video is" : "photos or videos are"} missing a caption.`
    );

  return { ok: messages.length === 0, itemErrors, mediaErrors, messages };
}

// ---- Datas (YYYY-MM-DD tratado como data local, sem deslocar o dia) ---------
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parts(ymd: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

// "October 23, 2026"
export function longDate(ymd: string | null | undefined): string {
  const p = parts(ymd);
  return p ? `${MONTHS[p.m - 1]} ${p.d}, ${p.y}` : "";
}

// "October 2026"
export function monthYear(ymd: string | null | undefined): string {
  const p = parts(ymd);
  return p ? `${MONTHS[p.m - 1]} ${p.y}` : "";
}

// Hoje em YYYY-MM-DD no fuso da empresa (Cape Cod).
export function todayNY(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Nome do PDF: "Inspection Report October 2026 - 12 Bay St, Falmouth, MA.pdf"
export function inspectionPdfName(inspectedOn: string, address: string): string {
  const base = `Inspection Report ${monthYear(inspectedOn)} - ${address}`
    .replace(/[\\/:*?"<>|\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  return `${base}.pdf`;
}
