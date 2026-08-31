"use server";

// =============================================================================
// RESGATE DOS RECIBOS DO BUBBLE
// =============================================================================
// 515 recibos de pagamento ainda MORAM no CDN do Bubble — o portal só guarda o
// link. Se a Andrea cancelar o Bubble, as imagens somem pra sempre (a linha do
// pagamento fica, a PROVA some).
//
// Esta rotina copia cada arquivo pro bucket privado `documents` e repõe o
// file_url apontando pro nosso storage.
//
// O QUE ELA NÃO FAZ (importante — a Andrea perguntou exatamente isso):
// NÃO cria payment nenhum, NÃO cria attachment novo, NÃO move recibo de um
// pagamento pro outro. Cada um dos 515 recibos JÁ está preso no pagamento certo;
// aqui só troca ONDE O ARQUIVO MORA. Consolidar mês partido em 1 pagamento com
// várias parcelas é um trabalho SEPARADO (44 grupos / 97 linhas / $12.486 de
// comissão) — não acontece aqui.
//
// Roda em LOTES porque a função da Vercel tem limite de tempo; o cliente chama
// em loop até remaining = 0. É IDEMPOTENTE: depois que a linha migra, o
// file_url deixa de começar com http e ela não é mais escolhida.
//
// Bônus de segurança: no Bubble esses arquivos são PÚBLICOS (URL aberta, sem
// login). Trazendo pro bucket privado, recibo de inquilino deixa de ser
// acessível por quem tiver o link.
// =============================================================================

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/session";
import { canDelete } from "@/lib/auth/capabilities";
import { revalidatePath } from "next/cache";

const BUCKET = "documents";
const BATCH = 6; // conservador: 6 × (baixar + subir) cabe folgado no limite da Vercel
const FETCH_TIMEOUT_MS = 20_000;
const MAX_BYTES = 45 * 1024 * 1024; // acima disso o upload falharia no storage

export interface RescueProgress {
  copied: number;
  failed: number;
  remaining: number;
  errors: { fileName: string; reason: string }[];
}

// OWNER ONLY: é uma reescrita em massa de registro financeiro.
async function assertOwner() {
  const profile = await getProfile();
  if (!canDelete(profile)) {
    throw new Error("Only the owner can run the receipt rescue.");
  }
}

function safeName(name: string): string {
  const cleaned = (name || "receipt")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "");
  return (cleaned || "receipt").slice(0, 80);
}

// O content-type do CDN é a fonte boa; extensão é o plano B.
function contentTypeFor(headerType: string | null, fileName: string): string {
  const t = (headerType || "").split(";")[0].trim().toLowerCase();
  if (t && t !== "application/octet-stream" && t !== "binary/octet-stream") return t;
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  switch (ext) {
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png":  return "image/png";
    case "webp": return "image/webp";
    case "heic": return "image/heic";
    case "gif":  return "image/gif";
    case "pdf":  return "application/pdf";
    default:     return "application/octet-stream";
  }
}

export async function rescueReceiptBatchAction(): Promise<RescueProgress> {
  await assertOwner();
  const supabase = createClient();

  // Pula as que já falharam antes — senão um arquivo morto trava o loop.
  const { data: rows, error } = await supabase
    .from("payment_attachments")
    .select("id, payment_id, file_url, file_name")
    .like("file_url", "http%")
    .is("migration_note", null)
    .limit(BATCH);
  if (error) throw new Error(error.message);

  let copied = 0;
  let failed = 0;
  const errors: { fileName: string; reason: string }[] = [];

  for (const row of rows ?? []) {
    const fileName = (row.file_name as string) || "receipt";
    try {
      const res = await fetch(row.file_url as string, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Bubble returned ${res.status}`);

      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength === 0) throw new Error("File came back empty");
      if (buf.byteLength > MAX_BYTES) throw new Error("File is too large to store");

      const path = `payment-receipts/${crypto.randomUUID()}-${safeName(fileName)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, {
        contentType: contentTypeFor(res.headers.get("content-type"), fileName),
        upsert: false,
      });
      if (upErr) throw new Error(upErr.message);

      // Só agora repontamos o link. Se esta parte falhar, o arquivo fica órfão
      // no storage (inofensivo) e a linha continua apontando pro Bubble — ou
      // seja, tentável de novo. Nunca ficamos com link quebrado.
      const { error: updErr } = await supabase
        .from("payment_attachments")
        .update({ file_url: path, migration_note: null })
        .eq("id", row.id as string);
      if (updErr) throw new Error(updErr.message);

      copied++;
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : "Unknown error";
      errors.push({ fileName, reason });
      await supabase
        .from("payment_attachments")
        .update({ migration_note: reason.slice(0, 300) })
        .eq("id", row.id as string);
    }
  }

  const { count } = await supabase
    .from("payment_attachments")
    .select("id", { count: "exact", head: true })
    .like("file_url", "http%")
    .is("migration_note", null);

  if (copied > 0) revalidatePath("/payments");

  return { copied, failed, remaining: count ?? 0, errors };
}

// Zera as notas de erro pra tentar os que falharam de novo (ex.: queda de rede).
export async function retryFailedReceiptsAction(): Promise<{ cleared: number }> {
  await assertOwner();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payment_attachments")
    .update({ migration_note: null })
    .not("migration_note", "is", null)
    .like("file_url", "http%")
    .select("id");
  if (error) throw new Error(error.message);
  return { cleared: (data ?? []).length };
}
