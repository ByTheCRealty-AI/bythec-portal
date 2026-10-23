// =============================================================================
// GET /propriedades/[id]/inspections/[inspectionId]/pdf — PDF da inspeção.
// =============================================================================
// Finalizada: devolve o PDF GUARDADO (o mesmo que está nos documentos da casa).
// Rascunho (ou PDF sumido): gera na hora, sem salvar — serve de prévia.
// ?download=1 -> attachment (baixa); sem isso -> inline (abre no navegador).
// Gate igual às outras rotas de PDF: capability checada aqui + RLS na leitura.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { buildInspectionPdf, loadInspectionBundle } from "@/lib/inspection-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function disposition(kind: "inline" | "attachment", fname: string): string {
  const ascii = fname.replace(/[^\x20-\x7E]/g, "").replace(/"/g, "'");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fname)}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; inspectionId: string } }
) {
  const profile = await getProfile();
  if (
    !can(profile, "properties.edit") &&
    !can(profile, "operations.edit") &&
    !can(profile, "properties.own")
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const supabase = createClient();
  const bundle = await loadInspectionBundle(supabase, params.inspectionId);
  if (!bundle || bundle.inspection.property_id !== params.id) {
    return new NextResponse("Not found", { status: 404 });
  }
  const kind = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";

  // PDF guardado (inspeção finalizada).
  if (bundle.inspection.pdf_document_id) {
    const { data: doc } = await supabase
      .from("documents")
      .select("file_url, file_name")
      .eq("id", bundle.inspection.pdf_document_id)
      .maybeSingle();
    const d = doc as { file_url: string; file_name: string | null } | null;
    if (d) {
      const { data: blob } = await supabase.storage.from("documents").download(d.file_url);
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer());
        return new NextResponse(buf, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": disposition(kind, d.file_name ?? "Inspection Report.pdf"),
            "Cache-Control": "no-store",
          },
        });
      }
    }
  }

  // Prévia (rascunho) ou fallback: gera na hora.
  const { bytes, fileName } = await buildInspectionPdf(supabase, bundle);
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition(kind, fileName),
      "Cache-Control": "no-store",
    },
  });
}
