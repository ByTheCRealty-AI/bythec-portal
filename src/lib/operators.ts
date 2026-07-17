import type { createClient } from "@/lib/supabase/server";

// Mapa id -> nome dos operadores internos (owner/manager/secretary), pra exibir
// "Added by X" em notes/services/requests. Usa a função operator_names()
// (SECURITY DEFINER) porque o RLS de profiles não deixa um usuário ver o perfil
// de outro. Só nome — nada de email/telefone. Silencioso: se falhar, mapa vazio
// (a atribuição some, nada quebra).
export async function operatorNameMap(
  supabase: ReturnType<typeof createClient>
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await supabase.rpc("operator_names");
  if (error || !data) return map;
  for (const row of data as { id: string; full_name: string | null }[]) {
    if (row.full_name) map.set(row.id, row.full_name);
  }
  return map;
}

// Anexa created_by_name a uma lista de registros que têm created_by.
export function withCreatorNames<T extends { created_by?: string | null }>(
  rows: T[],
  names: Map<string, string>
): T[] {
  return rows.map((r) => ({
    ...r,
    created_by_name: r.created_by ? names.get(r.created_by) ?? null : null,
  }));
}
