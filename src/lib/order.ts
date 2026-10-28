// =============================================================================
// Ordem de listas de ARQUIVOS enviados (documentos, recibos, anexos).
// =============================================================================
// Regra da Andrea (2026-09-10, "ALWAYS remember this"): toda lista de uploads no
// portal vai do MAIS NOVO pro MAIS ANTIGO — o arquivo recém-enviado aparece no topo.
// Memória: documents-newest-first.
//
// Por que ordenar em código e não no SQL: relação embutida do Supabase
// (`attachments:payment_attachments (...)`) volta SEM ordem garantida.
// Exceções decididas por ela: fotos de listing (a 1ª é a capa) e o PDF combinado
// de invoice (recibos do mais antigo pro mais novo, na ordem em que foram anexados).
// =============================================================================

type Stamped = { created_at?: string | null };

const when = (x: Stamped) => (x.created_at ? Date.parse(x.created_at) || 0 : 0);

// Ordena NO LUGAR (sort é estável: empate mantém a ordem original). Devolve o array.
export function newestFirst<T extends Stamped>(items: T[]): T[] {
  return items.sort((a, b) => when(b) - when(a));
}

export function oldestFirst<T extends Stamped>(items: T[]): T[] {
  return items.sort((a, b) => when(a) - when(b));
}

// Para linhas que carregam anexos embutidos: ordena `attachments` de cada linha
// e, quando houver, os `attachments` de cada parcela (`parts`) — pagamentos,
// expenses, aplicações. Cast via unknown de propósito: funciona com qualquer
// tipo de linha sem acoplar a interfaces específicas.
export function attachmentsNewestFirst<T>(rows: T[]): T[] {
  type Row = { attachments?: Stamped[] | null; parts?: { attachments?: Stamped[] | null }[] | null };
  for (const r of rows as unknown as Row[]) {
    if (r.attachments) newestFirst(r.attachments);
    for (const part of r.parts ?? []) if (part.attachments) newestFirst(part.attachments);
  }
  return rows;
}

// Endereço em ordem alfabética/numérica NATURAL (Andrea 2026-10-28: "coloca as
// listings em ordem alfa/numérica como em properties"). Collator com
// numeric:true faz "7 Wolf" vir antes de "11 Mary David" e "19" antes de "118"
// — o sort de texto puro do banco punha 118 antes de 19. Desempata pela unidade
// (address2), pra 155 Bayview A vir antes do B.
const addressCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function byAddress(a: { address?: string | null; address2?: string | null },
                          b: { address?: string | null; address2?: string | null }): number {
  const main = addressCollator.compare(a.address ?? "", b.address ?? "");
  return main !== 0 ? main : addressCollator.compare(a.address2 ?? "", b.address2 ?? "");
}

export function sortByAddress<T extends { address?: string | null; address2?: string | null }>(rows: T[]): T[] {
  return [...rows].sort(byAddress);
}
