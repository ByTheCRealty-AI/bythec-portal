// =============================================================================
// GET /invoices/[id]/combined-pdf — gera o PDF COMBINADO: a folha da invoice
// (desenhada com pdf-lib) + os recibos anexados (PDFs mesclados, imagens como
// página). Devolve já nomeado "Invoice ### (endereço).pdf" pra subir no eDeluxe.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import type { Invoice, InvoiceItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const INK = rgb(0.12, 0.12, 0.13);
const MUTED = rgb(0.45, 0.45, 0.47);
const LINE = rgb(0.85, 0.85, 0.86);
const GREEN = rgb(0.098, 0.522, 0.466); // #198577

function money(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return (
    "$" +
    v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "";
  const ymd = s.slice(0, 10);
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${m}/${d}/${y}`;
}

function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

// Só a rua (antes da 1ª vírgula) — "80 Frederick B Douglas Rd, North Falmouth, MA…"
// vira "80 Frederick B Douglas Rd". Mantém o nome do arquivo e a linha enxutos.
function streetOnly(s: string | null | undefined): string {
  if (!s) return "";
  return s.split(",")[0].trim();
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, client:client_id(id,name,email,phone,billing_address,billing_address2,billing_city,billing_state,billing_zip), property:property_id(id,address,address2), items:invoice_items(*), attachments:invoice_attachments(id,file_url,file_name,content_type,created_at)"
    )
    .eq("id", params.id)
    .single();
  if (error || !data) return new NextResponse("Not found", { status: 404 });

  const inv = data as unknown as Invoice & {
    client: { name: string | null; billing_address: string | null; billing_address2: string | null; billing_city: string | null; billing_state: string | null; billing_zip: string | null } | null;
    property: { address: string | null; address2: string | null } | null;
    items: InvoiceItem[];
    attachments: { id: string; file_url: string; file_name: string | null; content_type: string | null; created_at: string }[];
  };

  const isSeasonal = inv.kind === "seasonal";
  const access =
    can(profile, "financials.full") ||
    (isSeasonal ? can(profile, "invoices.seasonal") : can(profile, "invoices.service"));
  if (!access) return new NextResponse("Forbidden", { status: 403 });

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE_W, PAGE_H]);

  const T = (s: string, x: number, y: number, size: number, f = font, color = INK) =>
    page.drawText(s ?? "", { x, y, size, font: f, color });
  // Texto alinhado à direita.
  const TR = (s: string, xRight: number, y: number, size: number, f = font, color = INK) => {
    const w = f.widthOfTextAtSize(s ?? "", size);
    page.drawText(s ?? "", { x: xRight - w, y, size, font: f, color });
  };
  const hline = (y: number, x1 = MARGIN, x2 = PAGE_W - MARGIN, color = LINE) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.7, color });

  let y = PAGE_H - MARGIN;

  // ---- Header ----
  T("By the C Realty", MARGIN, y - 4, 18, bold);
  T("and Property Management", MARGIN, y - 22, 10, font, MUTED);
  T("info@bythecrealty.com  ·  Cape Cod, MA", MARGIN, y - 36, 9, font, MUTED);

  TR("INVOICE", PAGE_W - MARGIN, y - 2, 9, bold, MUTED);
  TR(`#${inv.invoice_number}`, PAGE_W - MARGIN, y - 22, 20, bold);
  TR(`Date: ${fmtDate(inv.date)}`, PAGE_W - MARGIN, y - 38, 9, font, MUTED);
  if (isSeasonal && inv.platform) TR(`Platform: ${inv.platform}`, PAGE_W - MARGIN, y - 50, 9, font, MUTED);

  y -= 66;
  hline(y);
  y -= 26;

  // ---- Invoice to / Reservation ----
  const colR = MARGIN + 280;
  T("INVOICE TO", MARGIN, y, 8.5, bold, MUTED);
  T(isSeasonal ? "RESERVATION DETAILS" : "SERVICE ADDRESS", colR, y, 8.5, bold, MUTED);
  y -= 16;

  const billLines: string[] = [];
  if (inv.client?.name) billLines.push(inv.client.name);
  if (inv.client?.billing_address) billLines.push(inv.client.billing_address);
  if (inv.client?.billing_address2) billLines.push(inv.client.billing_address2);
  const cityLine = [inv.client?.billing_city, inv.client?.billing_state, inv.client?.billing_zip]
    .filter(Boolean)
    .join(", ");
  if (cityLine) billLines.push(cityLine);

  const rightLines: string[] = [];
  if (isSeasonal) {
    if (inv.guest_name) rightLines.push(`Guest: ${inv.guest_name}`);
    if (inv.dates_reserved_start || inv.dates_reserved_end)
      rightLines.push(`Dates: ${fmtDate(inv.dates_reserved_start)} – ${fmtDate(inv.dates_reserved_end)}`);
    if (inv.property?.address) rightLines.push(`Property: ${streetOnly(inv.property.address)}`);
    if (inv.rental_nights != null) rightLines.push(`Nights: ${inv.rental_nights}`);
  } else {
    const addr = inv.service_address ?? inv.property?.address ?? "";
    if (addr) rightLines.push(addr);
  }

  const startY = y;
  billLines.forEach((l, i) => T(l, MARGIN, startY - i * 14, 10));
  rightLines.forEach((l, i) => T(l, colR, startY - i * 14, 10));
  y = startY - Math.max(billLines.length, rightLines.length) * 14 - 18;

  // ---- Body ----
  if (isSeasonal) {
    const guestItems = inv.items.filter((it) => it.guest);
    const ownerItems = inv.items.filter((it) => it.owner);
    const colGap = 24;
    const boxW = (PAGE_W - MARGIN * 2 - colGap) / 2;
    const leftX = MARGIN;
    const rightX = MARGIN + boxW + colGap;

    const drawColumn = (
      x: number,
      title: string,
      items: InvoiceItem[],
      totalLabel: string,
      totalVal: number
    ): number => {
      let cy = y;
      T(title, x + 4, cy, 12, bold);
      cy -= 18;
      hline(cy + 6, x, x + boxW);
      for (const it of items) {
        T(it.description, x + 4, cy - 8, 10, font, it.total < 0 ? MUTED : INK);
        TR(money(it.total), x + boxW - 4, cy - 8, 10, font, it.total < 0 ? MUTED : INK);
        cy -= 18;
      }
      cy -= 6;
      hline(cy + 8, x, x + boxW);
      T(totalLabel, x + 4, cy - 6, 11, bold);
      TR(money(totalVal), x + boxW - 4, cy - 6, 12, bold, GREEN);
      cy -= 24;
      return cy;
    };

    const leftEnd = drawColumn(leftX, "Paid by Guest", guestItems, "Total Paid by Guest", inv.total_paid_by_guest ?? 0);
    const rightEnd = drawColumn(rightX, "Owner Overview", ownerItems, "Total Received by Owner", inv.total_received_by_owner ?? 0);
    y = Math.min(leftEnd, rightEnd) - 10;
  } else {
    // Service: tabela única + totais.
    T("Description", MARGIN, y, 8.5, bold, MUTED);
    TR("Amount", PAGE_W - MARGIN, y, 8.5, bold, MUTED);
    y -= 6;
    hline(y);
    y -= 16;
    for (const it of inv.items) {
      T(it.description, MARGIN, y, 10);
      TR(money(it.total), PAGE_W - MARGIN, y, 10);
      y -= 16;
    }
    y -= 8;
    hline(y + 6);
    const labor = inv.labor_total ?? 0;
    const material = inv.material_total ?? 0;
    T("Total Labor", PAGE_W - MARGIN - 180, y - 8, 10, font, MUTED);
    TR(money(labor), PAGE_W - MARGIN, y - 8, 10);
    T("Total Material", PAGE_W - MARGIN - 180, y - 24, 10, font, MUTED);
    TR(money(material), PAGE_W - MARGIN, y - 24, 10);
    T("Total", PAGE_W - MARGIN - 180, y - 44, 11, bold);
    TR(money(labor + material), PAGE_W - MARGIN, y - 44, 12, bold, GREEN);
    y -= 60;
  }

  // ---- Notes ----
  if (inv.notes) {
    y -= 10;
    hline(y + 8);
    T("NOTES", MARGIN, y - 6, 8.5, bold, MUTED);
    T(inv.notes.slice(0, 400), MARGIN, y - 22, 9, font, INK);
    y -= 40;
  }

  // ---- Footer ----
  T("By the C Realty and Property Management LLC", MARGIN, MARGIN - 14, 8, font, MUTED);

  // ---- Append attachments ----
  const attachments = (inv.attachments ?? [])
    .slice()
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));

  for (const att of attachments) {
    let bytes: Uint8Array | null = null;
    try {
      if (/^https?:\/\//i.test(att.file_url)) {
        const r = await fetch(att.file_url);
        if (r.ok) bytes = new Uint8Array(await r.arrayBuffer());
      } else {
        const { data: blob } = await supabase.storage.from("documents").download(att.file_url);
        if (blob) bytes = new Uint8Array(await blob.arrayBuffer());
      }
    } catch {
      bytes = null;
    }
    if (!bytes) continue;

    const ct = (att.content_type ?? "").toLowerCase();
    const name = (att.file_name ?? "").toLowerCase();
    const isPdf = ct.includes("pdf") || name.endsWith(".pdf");
    const isJpg = ct.includes("jpeg") || ct.includes("jpg") || name.endsWith(".jpg") || name.endsWith(".jpeg");
    const isPng = ct.includes("png") || name.endsWith(".png");

    try {
      if (isPdf) {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copied = await pdf.copyPages(src, src.getPageIndices());
        copied.forEach((p) => pdf.addPage(p));
      } else if (isJpg || isPng) {
        const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const p = pdf.addPage([PAGE_W, PAGE_H]);
        const maxW = PAGE_W - MARGIN * 2;
        const maxH = PAGE_H - MARGIN * 2;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        p.drawImage(img, { x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, width: w, height: h });
      }
      // Outros tipos (HEIC etc.) são ignorados — não embutíveis no PDF.
    } catch {
      // Anexo corrompido/incompatível: pula, não derruba o documento todo.
    }
  }

  const out = await pdf.save();

  const propLabel = streetOnly(inv.property?.address) || streetOnly(inv.service_address) || inv.client?.name || "";
  const fname = sanitizeFilename(`Invoice ${inv.invoice_number}${propLabel ? ` (${propLabel})` : ""}`) + ".pdf";

  return new NextResponse(Buffer.from(out), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(fname)}`,
      "Cache-Control": "no-store",
    },
  });
}
