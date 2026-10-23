// =============================================================================
// By the C — Inspeção de propriedade · carga de dados + PDF (SERVER-ONLY)
// =============================================================================
// loadInspectionBundle: inspeção + propriedade (com owner) + itens + mídia, com a
// sessão do usuário (RLS). Usado pela tela, pelas actions e pela rota do PDF.
//
// buildInspectionPdf: desenha o relatório com pdf-lib, espelhando o modelo Word
// da Andrea (título, cabeçalho, texto padrão, tabela por seção, notas,
// recomendações, fecho) + seção "Photos" com cada foto e a legenda embaixo.
// Mesmo estilo das outras rotas de PDF (Helvetica, verdes da marca, wrap de texto,
// quebra de página). Vídeo não entra em PDF: vira a linha "Video: <legenda>".
// =============================================================================

import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { createClient } from "@/lib/supabase/server";
import {
  INSPECTION_COLUMNS,
  INSPECTION_ITEM_COLUMNS,
  INSPECTION_MEDIA_COLUMNS,
  RESULT_LABEL,
  groupBySection,
  longDate,
  inspectionPdfName,
  todayNY,
  type Inspection,
  type InspectionItem,
  type InspectionMedia,
} from "@/lib/inspections";

type Supa = ReturnType<typeof createClient>;

export interface InspectionProperty {
  id: string;
  address: string;
  address2: string | null;
  owner: { id: string; name: string; email: string | null } | null;
}

export interface InspectionBundle {
  inspection: Inspection;
  property: InspectionProperty;
  items: InspectionItem[];
  media: InspectionMedia[];
}

export async function loadInspectionBundle(
  supabase: Supa,
  inspectionId: string
): Promise<InspectionBundle | null> {
  const { data: insp, error } = await supabase
    .from("inspections")
    .select(INSPECTION_COLUMNS)
    .eq("id", inspectionId)
    .maybeSingle();
  if (error || !insp) return null;
  const inspection = insp as unknown as Inspection;

  const [{ data: prop }, { data: itemsData }, { data: mediaData }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, address, address2, owner:owner_id (id, name, email)")
      .eq("id", inspection.property_id)
      .maybeSingle(),
    supabase
      .from("inspection_items")
      .select(INSPECTION_ITEM_COLUMNS)
      .eq("inspection_id", inspectionId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("inspection_media")
      .select(INSPECTION_MEDIA_COLUMNS)
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: false }),
  ]);
  if (!prop) return null;

  return {
    inspection,
    property: prop as unknown as InspectionProperty,
    items: (itemsData ?? []) as unknown as InspectionItem[],
    media: (mediaData ?? []) as unknown as InspectionMedia[],
  };
}

export function fullAddress(p: Pick<InspectionProperty, "address" | "address2">): string {
  return p.address2 ? `${p.address} - ${p.address2}` : p.address;
}

// ISO timestamp -> YYYY-MM-DD no fuso da empresa.
function ymdNY(iso: string | null | undefined): string {
  if (!iso) return todayNY();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayNY();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// ---- PDF --------------------------------------------------------------------
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const INK = rgb(0.12, 0.12, 0.13);
const MUTED = rgb(0.45, 0.45, 0.47);
const LINE = rgb(0.85, 0.85, 0.86);
const GREEN = rgb(0.098, 0.522, 0.466); // #198577
const GREEN_2 = rgb(0.016, 0.635, 0.498); // #04a27f
const GREEN_TINT = rgb(0.91, 0.96, 0.95);
const ATTN = rgb(0.76, 0.35, 0.03); // laranja (Needs attention)
const ATTN_TINT = rgb(1, 0.94, 0.86);

const COMPANY = "By the C Realty & Property Management, LLC";
const INTRO =
  "A routine property inspection was completed on the date noted above. The purpose of this inspection was to verify the general condition of the property, identify any maintenance concerns, and ensure the property continues to be maintained properly.";
const OVERALL =
  "At the time of inspection, the property was found to be in overall satisfactory condition unless otherwise noted below.";
const CLOSING =
  "At this time, no major concerns were observed unless specifically stated in this report. We will continue to monitor the property during future inspections and notify ownership if additional issues arise.";

// Aspas/travessões curvos -> ASCII; remove o que a Helvetica/WinAnsi não desenha.
function clean(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/·/g, "-")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "");
}

function wrapText(text: string, f: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split("\n")) {
    if (para.trim() === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(test, size) <= maxW) {
        line = test;
      } else {
        if (line) out.push(line);
        if (f.widthOfTextAtSize(word, size) > maxW) {
          let chunk = "";
          for (const ch of word) {
            if (f.widthOfTextAtSize(chunk + ch, size) <= maxW) chunk += ch;
            else {
              if (chunk) out.push(chunk);
              chunk = ch;
            }
          }
          line = chunk;
        } else {
          line = word;
        }
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function isJpeg(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
}
function isPng(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

export async function buildInspectionPdf(
  supabase: Supa,
  bundle: InspectionBundle
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const { inspection, property, items, media } = bundle;
  const address = fullAddress(property);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Property Inspection Report - ${clean(address)}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const BOTTOM = MARGIN + 18; // espaço do rodapé

  const T = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color = INK) =>
    page.drawText(clean(s), { x, y: yy, size, font: f, color });
  const hline = (yy: number, x1 = MARGIN, x2 = PAGE_W - MARGIN, color = LINE) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.7, color });
  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  // Se não cabe `space`, página nova (e chama onNew pra redesenhar cabeçalho de tabela).
  const ensure = (space: number, onNew?: () => void) => {
    if (y - space < BOTTOM) {
      newPage();
      if (onNew) onNew();
    }
  };
  const paragraph = (text: string, size = 10, f: PDFFont = font, color = INK) => {
    const lines = wrapText(text, f, size, CONTENT_W);
    const lh = size + 3.5;
    for (const ln of lines) {
      ensure(lh);
      T(ln, MARGIN, y - size, size, f, color);
      y -= lh;
    }
  };
  const heading = (text: string) => {
    ensure(40);
    y -= 10;
    T(text, MARGIN, y - 12, 12.5, bold, GREEN);
    y -= 18;
    hline(y, MARGIN, PAGE_W - MARGIN, GREEN_2);
    y -= 10;
  };

  // ---- Cabeçalho -------------------------------------------------------------
  page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: GREEN });
  T("PROPERTY INSPECTION REPORT", MARGIN, y - 16, 19, bold, GREEN);
  T(COMPANY, MARGIN, y - 33, 10, font, MUTED);
  y -= 46;
  hline(y);
  y -= 16;

  const LABEL_W = 110;
  const field = (label: string, value: string) => {
    const lines = wrapText(value || "-", font, 10.5, CONTENT_W - LABEL_W);
    ensure(lines.length * 14 + 4);
    T(label, MARGIN, y - 10.5, 10.5, bold);
    lines.forEach((ln, i) => T(ln, MARGIN + LABEL_W, y - 10.5 - i * 14, 10.5));
    y -= lines.length * 14 + 4;
  };
  field("Property Address:", address);
  field("Owner(s):", property.owner?.name ?? "");
  field("Inspection Date:", longDate(inspection.inspected_on));
  field("Inspected By:", inspection.inspected_by ?? "");
  y -= 8;

  paragraph(INTRO);

  heading("Overall Condition");
  paragraph(OVERALL);

  // ---- Inspection list (tabela por seção) -----------------------------------
  heading("Inspection list");
  const COL_ITEM = 170;
  const COL_RESULT = 100;
  const COL_NOTE = CONTENT_W - COL_ITEM - COL_RESULT;
  const X_ITEM = MARGIN;
  const X_RESULT = MARGIN + COL_ITEM;
  const X_NOTE = X_RESULT + COL_RESULT;
  const tableHeader = () => {
    T("Item", X_ITEM + 6, y - 10, 8.5, bold, MUTED);
    T("Result", X_RESULT + 6, y - 10, 8.5, bold, MUTED);
    T("Note", X_NOTE + 6, y - 10, 8.5, bold, MUTED);
    y -= 15;
    hline(y);
  };

  for (const group of groupBySection(items)) {
    ensure(22 + 15 + 20);
    page.drawRectangle({ x: MARGIN, y: y - 20, width: CONTENT_W, height: 20, color: GREEN_TINT });
    T(group.section, MARGIN + 6, y - 14, 10.5, bold, GREEN);
    y -= 22;
    tableHeader();
    for (const it of group.items) {
      const labelLines = wrapText(it.label, font, 9.5, COL_ITEM - 12);
      const noteLines = wrapText(it.note ?? "", font, 9, COL_NOTE - 12);
      const lines = Math.max(labelLines.length, noteLines.length, 1);
      const rowH = lines * 12 + 8;
      ensure(rowH, tableHeader);
      const top = y;
      const isAttn = it.result === "attention";
      if (isAttn) {
        page.drawRectangle({ x: X_RESULT + 2, y: top - rowH + 2, width: COL_RESULT - 4, height: rowH - 4, color: ATTN_TINT });
      }
      labelLines.forEach((ln, i) => T(ln, X_ITEM + 6, top - 12 - i * 12, 9.5));
      const resultText = it.result ? RESULT_LABEL[it.result] : "-";
      T(resultText, X_RESULT + 6, top - 12, 9.5, isAttn ? bold : font, isAttn ? ATTN : it.result === "na" ? MUTED : INK);
      noteLines.forEach((ln, i) => T(ln, X_NOTE + 6, top - 12 - i * 12, 9, font, INK));
      y = top - rowH;
      hline(y);
    }
    y -= 6;
  }

  heading("Inspection Notes & Observations");
  paragraph(inspection.notes?.trim() ? inspection.notes : "None.");

  heading("Maintenance Recommendations");
  paragraph(inspection.recommendations?.trim() ? inspection.recommendations : "None.");

  y -= 10;
  paragraph(CLOSING);
  y -= 10;
  ensure(60);
  paragraph("Thank you,");
  paragraph(COMPANY, 10, bold);
  y -= 4;
  paragraph(`Date: ${longDate(ymdNY(inspection.finished_at))}`);

  // ---- Photos ------------------------------------------------------------------
  // Agrupado por item: Needs attention primeiro, depois os outros itens na ordem
  // do checklist, e por fim as fotos/vídeos gerais. Dentro de cada grupo, na ordem
  // em que foram tiradas (relatório lê melhor assim).
  if (media.length > 0) {
    const byItem = new Map<string, InspectionMedia[]>();
    const general: InspectionMedia[] = [];
    for (const m of media) {
      if (m.item_id) {
        const arr = byItem.get(m.item_id);
        if (arr) arr.push(m);
        else byItem.set(m.item_id, [m]);
      } else general.push(m);
    }
    const ordered = groupBySection(items).flatMap((g) => g.items);
    const groups: { title: string; attention: boolean; note: string | null; media: InspectionMedia[] }[] = [];
    for (const attentionPass of [true, false]) {
      for (const it of ordered) {
        const list = byItem.get(it.id);
        if (!list || list.length === 0) continue;
        if ((it.result === "attention") !== attentionPass) continue;
        groups.push({
          title: `${it.section} - ${it.label}${it.result ? ` (${RESULT_LABEL[it.result]})` : ""}`,
          attention: it.result === "attention",
          note: it.note,
          media: list,
        });
      }
    }
    if (general.length > 0) groups.push({ title: "General photos and videos", attention: false, note: null, media: general });

    // Baixa todas as fotos em paralelo (bucket privado, sessão do usuário).
    const photoBytes = new Map<string, Uint8Array>();
    await Promise.all(
      media
        .filter((m) => m.kind === "photo")
        .map(async (m) => {
          try {
            const { data: blob } = await supabase.storage.from("documents").download(m.storage_path);
            if (blob) photoBytes.set(m.id, new Uint8Array(await blob.arrayBuffer()));
          } catch {
            /* foto indisponível: sai só a legenda */
          }
        })
    );

    newPage();
    T("Photos", MARGIN, y - 16, 17, bold, GREEN);
    y -= 26;
    hline(y, MARGIN, PAGE_W - MARGIN, GREEN_2);
    y -= 12;

    const GAP = 16;
    const CELL_W = (CONTENT_W - GAP) / 2;
    const MAX_IMG_H = 220;

    for (const g of groups) {
      const sorted = [...g.media].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const photos = sorted.filter((m) => m.kind === "photo");
      const videos = sorted.filter((m) => m.kind === "video");

      ensure(60);
      y -= 6;
      const titleLines = wrapText(g.title, bold, 11, CONTENT_W);
      titleLines.forEach((ln) => {
        T(ln, MARGIN, y - 11, 11, bold, g.attention ? ATTN : INK);
        y -= 15;
      });
      if (g.note && g.note.trim()) {
        for (const ln of wrapText(`Note: ${g.note}`, font, 9.5, CONTENT_W)) {
          ensure(13);
          T(ln, MARGIN, y - 9.5, 9.5, font, MUTED);
          y -= 13;
        }
      }
      y -= 6;

      // Fotos em grade de 2 colunas, legenda embaixo de cada uma.
      for (let i = 0; i < photos.length; i += 2) {
        const row = photos.slice(i, i + 2).map((m) => ({ m, img: null as PDFImage | null, w: 0, h: 0 }));
        for (const cell of row) {
          const bytes = photoBytes.get(cell.m.id);
          if (!bytes) continue;
          try {
            cell.img = isPng(bytes) ? await pdf.embedPng(bytes) : isJpeg(bytes) ? await pdf.embedJpg(bytes) : null;
          } catch {
            cell.img = null;
          }
          if (cell.img) {
            const scale = Math.min(CELL_W / cell.img.width, MAX_IMG_H / cell.img.height, 1);
            cell.w = cell.img.width * scale;
            cell.h = cell.img.height * scale;
          }
        }
        const capLines = row.map((c) =>
          wrapText(c.img ? c.m.caption || "-" : `${c.m.caption || "-"} (photo unavailable)`, font, 9, CELL_W)
        );
        const imgH = Math.max(...row.map((c) => c.h), 0);
        const capH = Math.max(...capLines.map((l) => l.length), 1) * 11;
        const rowH = imgH + 6 + capH + 14;
        ensure(rowH);
        const top = y;
        row.forEach((c, ci) => {
          const x = MARGIN + ci * (CELL_W + GAP);
          if (c.img) page.drawImage(c.img, { x, y: top - c.h, width: c.w, height: c.h });
          capLines[ci].forEach((ln, li) => T(ln, x, top - imgH - 6 - 9 - li * 11, 9, font, INK));
        });
        y = top - rowH;
      }

      for (const v of videos) {
        for (const ln of wrapText(`Video: ${v.caption || "-"} (available in the portal)`, font, 9.5, CONTENT_W)) {
          ensure(13);
          T(ln, MARGIN, y - 9.5, 9.5, font, INK);
          y -= 13;
        }
      }
      y -= 8;
      hline(y + 4);
    }
  }

  // ---- Rodapé + numeração --------------------------------------------------------
  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    pg.drawText(clean(`${COMPANY}  -  Property Inspection Report`), {
      x: MARGIN,
      y: MARGIN - 14,
      size: 8,
      font,
      color: MUTED,
    });
    const label = `Page ${i + 1} of ${pages.length}`;
    const w = font.widthOfTextAtSize(label, 8);
    pg.drawText(label, { x: PAGE_W - MARGIN - w, y: MARGIN - 14, size: 8, font, color: MUTED });
  });

  const bytes = await pdf.save();
  return { bytes, fileName: inspectionPdfName(inspection.inspected_on, address) };
}
