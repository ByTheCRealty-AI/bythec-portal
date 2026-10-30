// =============================================================================
// GET /applications/[id]/pdf — PDF da aplicação de aluguel pra mandar ao OWNER.
// =============================================================================
// Gated por applications.manage. Desenha a aplicação inteira (pdf-lib) e anexa
// as fotos/arquivos de ID no fim. O que NÃO vai pro owner: SSN completo (só os
// últimos 4), notas internas, IP do consentimento e a taxa/pagamento — é
// documento que sai da By the C, então leva só o que o owner precisa decidir.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { EMPLOYMENT_STATUS_LABEL, RETIREMENT_SOURCE_LABEL, type RentalApplication } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const INK = rgb(0.12, 0.12, 0.13);
const MUTED = rgb(0.45, 0.45, 0.47);
const LINE = rgb(0.85, 0.85, 0.86);
const GREEN = rgb(0.098, 0.522, 0.466); // #198577

const COLUMNS =
  "id, status, rental_type, lease_start, property_id, property_other, full_name, date_of_birth, has_ssn, ssn_last4, ssn_none_explanation, phone, has_license, drivers_license, drivers_license_state, gov_id_type, gov_id_number, email, occupants_count, occupants, rental_history, vehicles, employment_status, retirement_income_sources, retired_since, business_name, business_type, employer, employer_address, manager_name, manager_phone, job_title, monthly_income, length_of_employment, personal_references, evicted, evicted_detail, felony, felony_detail, bankruptcy, bankruptcy_detail, smokes, has_pets, pets_detail, reason_for_moving, consent_agreed, signature_name, signature_date, signature_name_2, signature_date_2, submitted_at, created_at, property:property_id(id,address,address2), attachments:rental_application_attachments(id, category, occupant_index, label, file_path, file_name, content_type, created_at)";

function money(n: number | null | undefined): string {
  if (n == null) return "";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "";
  const [y, m, d] = s.slice(0, 10).split("-");
  if (!y || !m || !d) return s;
  return `${m}/${d}/${y}`;
}

function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

// Aspas/travessões curvos → ASCII; remove o que a Helvetica/WinAnsi não desenha.
function clean(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "");
}

function yn(v: boolean | null | undefined, detail?: string | null): string {
  if (v == null) return "";
  return v ? (detail ? `Yes - ${detail}` : "Yes") : "No";
}

function rentalTypeLabel(t: string | null | undefined): string {
  if (t === "year_round") return "Year-round";
  if (t === "winter") return "Winter / off-season";
  return "";
}

function govIdLabel(t: string | null): string {
  if (t === "state_id") return "State ID card";
  if (t === "passport") return "Passport";
  return "Government ID";
}

function streetOnly(s: string | null | undefined): string {
  return (s ?? "").split(",")[0].trim();
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!can(profile, "applications.manage")) return new NextResponse("Forbidden", { status: 403 });

  const supabase = createClient();
  const { data, error } = await supabase.from("rental_applications").select(COLUMNS).eq("id", params.id).single();
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  const a = data as unknown as RentalApplication;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const T = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color = INK) =>
    page.drawText(clean(s), { x, y: yy, size, font: f, color });
  const TR = (s: string, xRight: number, yy: number, size: number, f: PDFFont = font, color = INK) => {
    const t = clean(s);
    page.drawText(t, { x: xRight - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color });
  };
  const hline = (yy: number) =>
    page.drawLine({ start: { x: MARGIN, y: yy }, end: { x: PAGE_W - MARGIN, y: yy }, thickness: 0.7, color: LINE });
  const ensure = (space: number) => {
    if (y - space < MARGIN + 10) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };
  const wrap = (text: string, f: PDFFont, size: number, maxW: number): string[] => {
    const out: string[] = [];
    for (const para of clean(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(test, size) <= maxW) { line = test; continue; }
        if (line) out.push(line);
        line = word;
        // Palavra maior que a linha (e-mail longo etc.): parte no caractere.
        while (f.widthOfTextAtSize(line, size) > maxW) {
          let cut = line.length - 1;
          while (cut > 1 && f.widthOfTextAtSize(line.slice(0, cut), size) > maxW) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      out.push(line);
    }
    return out;
  };

  const LABEL_W = 150;
  const VALUE_X = MARGIN + LABEL_W;
  const VALUE_W = PAGE_W - MARGIN - VALUE_X;

  const section = (title: string) => {
    ensure(40);
    y -= 14;
    T(title.toUpperCase(), MARGIN, y, 8.5, bold, GREEN);
    y -= 6;
    hline(y);
    y -= 15;
  };
  const row = (label: string, value: string | null | undefined) => {
    const lines = wrap(value && value.trim() ? value : "-", font, 10, VALUE_W);
    ensure(lines.length * 13 + 4);
    T(label, MARGIN, y, 9.5, font, MUTED);
    lines.forEach((ln, i) => T(ln, VALUE_X, y - i * 13, 10));
    y -= lines.length * 13 + 4;
  };

  const propLabel = a.property
    ? [a.property.address, a.property.address2].filter(Boolean).join(" · ")
    : a.property_other ?? "";

  // ---- Header ----
  T("By the C Realty", MARGIN, y - 4, 18, bold);
  T("and Property Management", MARGIN, y - 22, 10, font, MUTED);
  T("info@bythecrealty.com  ·  Cape Cod, MA", MARGIN, y - 36, 9, font, MUTED);
  TR("RENTAL APPLICATION", PAGE_W - MARGIN, y - 2, 9, bold, MUTED);
  TR(a.full_name, PAGE_W - MARGIN, y - 22, 16, bold);
  TR(`Submitted: ${fmtDate(a.submitted_at)}`, PAGE_W - MARGIN, y - 38, 9, font, MUTED);
  y -= 52;
  hline(y);
  y -= 4;

  // ---- Rental ----
  section("Rental");
  row("Property", propLabel);
  row("Rental type", rentalTypeLabel(a.rental_type));
  row("Desired start", fmtDate(a.lease_start));

  // ---- Applicant ----
  section("Applicant");
  row("Full name", a.full_name);
  row("Date of birth", fmtDate(a.date_of_birth));
  row(
    "SSN / ITIN",
    a.has_ssn === false
      ? `None${a.ssn_none_explanation ? ` - ${a.ssn_none_explanation}` : ""}`
      : a.ssn_last4
      ? `On file (ending in ${a.ssn_last4})`
      : ""
  );
  row("Phone", a.phone);
  row("Email", a.email);
  if (a.has_license === false) {
    row(govIdLabel(a.gov_id_type), a.gov_id_number);
  } else {
    row("Driver's license", [a.drivers_license, a.drivers_license_state].filter(Boolean).join(" / "));
  }

  // ---- Occupants ----
  // Rótulo do parentesco (valor guardado é a chave do dropdown do /apply).
  const REL: Record<string, string> = {
    spouse_partner: "Spouse / partner", child: "Child", parent: "Parent", sibling: "Sibling",
    other_relative: "Other relative", friend_roommate: "Friend / roommate", other: "Other",
  };
  const relLabel = (v?: string | null) => (v ? REL[v] ?? v : null);
  const occupants = a.occupants ?? [];
  if (a.occupants_count || occupants.length > 0) {
    section(`Occupants${a.occupants_count ? ` (${a.occupants_count})` : ""}`);
    if (occupants.length === 0) row("Occupants", String(a.occupants_count ?? ""));
    occupants.forEach((o, i) =>
      row(
        o.name || `Occupant ${i + 1}`,
        [fmtDate(o.dob), relLabel(o.relationship), o.is_adult ? "18+" : null, o.phone, o.email]
          .filter(Boolean)
          .join(" · ")
      )
    );
  }

  // ---- Rental history ----
  if (a.rental_history?.length) {
    section("Rental history");
    for (const h of a.rental_history) {
      row(h.kind === "current" ? "Current address" : "Previous address", [h.street, h.city, h.state, h.zip].filter(Boolean).join(", "));
      row("Time there", h.ten_plus_years ? `${h.duration ?? ""} (5+ years - no previous address required)`.trim() : h.duration);
      row("Landlord", [h.landlord_name, h.landlord_phone].filter(Boolean).join(" · "));
      y -= 4;
    }
  }

  // ---- Employment / income ----
  section("Employment / income");
  const status = a.employment_status ?? "employed";
  row("Status", EMPLOYMENT_STATUS_LABEL[status]);
  if (status === "retired") {
    row("Income sources", (a.retirement_income_sources ?? []).map((x) => RETIREMENT_SOURCE_LABEL[x] ?? x).join(", "));
    row("Total monthly income", money(a.monthly_income));
    row("Retired since", a.retired_since);
  } else if (status === "self_employed") {
    row("Business name", a.business_name);
    row("Type of work", a.business_type);
    row("Self-employed for", a.length_of_employment);
    row("Average monthly income", money(a.monthly_income));
  } else {
    row("Employer", a.employer);
    row("Employer address", a.employer_address);
    row("Manager", [a.manager_name, a.manager_phone].filter(Boolean).join(" · "));
    row("Job title", a.job_title);
    row("Monthly income", money(a.monthly_income));
    row("Length of employment", a.length_of_employment);
  }
  if (status !== "employed") {
    const n = (a.attachments ?? []).filter((x) => x.category === "income_proof").length;
    row("Proof of income", n ? `${n} document${n > 1 ? "s" : ""} attached at the end` : "");
  }

  // ---- Vehicles ----
  if (a.vehicles?.length) {
    section("Vehicles");
    a.vehicles.forEach((v, i) =>
      row(
        v.make_model || `Vehicle ${i + 1}`,
        [v.year, v.color, [v.plate, v.plate_state].filter(Boolean).join(" ")].filter(Boolean).join(" · ")
      )
    );
  }

  // ---- References ----
  if (a.personal_references?.length) {
    section("References");
    a.personal_references.forEach((r, i) => row(r.name || `Reference ${i + 1}`, r.phone));
  }

  // ---- Additional ----
  section("Additional");
  row("Ever evicted", yn(a.evicted, a.evicted_detail));
  row("Felony", yn(a.felony, a.felony_detail));
  row("Bankruptcy", yn(a.bankruptcy, a.bankruptcy_detail));
  row("Smokes", yn(a.smokes));
  row("Pets", yn(a.has_pets, a.pets_detail));
  row("Reason for moving", a.reason_for_moving);

  // ---- Consent ----
  section("Consent & signature");
  row("Consent", a.consent_agreed ? "Agreed - background and credit check authorized" : "Not agreed");
  row("Signature", [a.signature_name, fmtDate(a.signature_date)].filter(Boolean).join(" · "));
  if (a.signature_name_2) row("Second signature", [a.signature_name_2, fmtDate(a.signature_date_2)].filter(Boolean).join(" · "));

  // ---- IDs anexados (foto = 1 página; PDF = páginas mescladas) ----
  const atts = (a.attachments ?? []).slice().sort((p, q) => {
    // Aplicante primeiro, depois ocupantes na ordem do formulário.
    // Aplicante, ocupantes, e por último os comprovantes de renda.
    const rank = (x: typeof p) =>
      x.category === "applicant_id" ? -1 : x.category === "income_proof" ? 1000 : x.occupant_index ?? 0;
    return rank(p) - rank(q);
  });
  const skipped: string[] = [];
  if (atts.length) {
    const admin = createAdminClient();
    for (const att of atts) {
      const who = att.category === "applicant_id" ? a.full_name : att.label || `Occupant ${(att.occupant_index ?? 0) + 1}`;
      const pageTitle = att.category === "income_proof" ? `Proof of income - ${a.full_name}` : `ID - ${who}`;
      let bytes: Uint8Array | null = null;
      try {
        const { data: blob } = await admin.storage.from("documents").download(att.file_path);
        if (blob) bytes = new Uint8Array(await blob.arrayBuffer());
      } catch {
        bytes = null;
      }
      const ct = (att.content_type ?? "").toLowerCase();
      const name = (att.file_name ?? "").toLowerCase();
      const isPdf = ct.includes("pdf") || name.endsWith(".pdf");
      const isPng = ct.includes("png") || name.endsWith(".png");
      const isJpg = ct.includes("jpeg") || ct.includes("jpg") || /\.jpe?g$/.test(name);
      try {
        if (!bytes) throw new Error("download");
        if (isPdf) {
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
          (await pdf.copyPages(src, src.getPageIndices())).forEach((p) => pdf.addPage(p));
        } else if (isJpg || isPng) {
          const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
          page = pdf.addPage([PAGE_W, PAGE_H]);
          T(pageTitle, MARGIN, PAGE_H - MARGIN, 11, bold);
          const maxW = PAGE_W - MARGIN * 2;
          const maxH = PAGE_H - MARGIN * 2 - 24;
          const s = Math.min(maxW / img.width, maxH / img.height, 1);
          const w = img.width * s;
          const h = img.height * s;
          page.drawImage(img, { x: (PAGE_W - w) / 2, y: MARGIN + (maxH - h) / 2, width: w, height: h });
        } else {
          throw new Error("format");
        }
      } catch {
        // HEIC (iPhone) e arquivo corrompido não embutem — avisa na lista.
        skipped.push(`${att.category === "income_proof" ? "Proof of income" : who} (${att.file_name || "file"})`);
      }
    }
  }

  // IDs que não couberam no PDF: página final avisando quais ficaram de fora.
  if (skipped.length) {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    T("FILES NOT INCLUDED", MARGIN, y, 8.5, bold, GREEN);
    y -= 18;
    for (const line of wrap(
      `These files are in a format that can't be placed in a PDF. Ask By the C for a copy if needed: ${skipped.join("; ")}.`,
      font,
      10,
      PAGE_W - MARGIN * 2
    )) {
      T(line, MARGIN, y, 10);
      y -= 13;
    }
  }

  // Rodapé em todas as páginas desenhadas por nós.
  for (const p of pdf.getPages()) {
    p.drawText("Confidential - By the C Realty and Property Management LLC", {
      x: MARGIN,
      y: MARGIN - 18,
      size: 8,
      font,
      color: MUTED,
    });
  }

  const out = await pdf.save();
  const where = streetOnly(a.property?.address) || streetOnly(a.property_other);
  const fname = sanitizeFilename(`Rental Application - ${a.full_name}${where ? ` (${where})` : ""}`) + ".pdf";

  return new NextResponse(Buffer.from(out), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(fname)}`,
      "Cache-Control": "no-store",
    },
  });
}
