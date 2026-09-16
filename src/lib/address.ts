// Endereço estruturado (Andrea: SEMPRE Street / City-town / State / ZIP separados,
// em TODO lugar que pede endereço). O banco guarda um texto único (`address`), que
// o resto do app lê (listas, invoices, PDF, match de payout). Aqui: quebrar o texto
// salvo nas partes pra editar, e recompor igual aos forms de criação.
export type AddressParts = { street: string; city: string; state: string; zip: string };

export function parseAddress(raw: string | null | undefined): AddressParts {
  const s = (raw ?? "")
    .trim()
    .replace(/,\s*,/g, ",")
    .replace(/,?\s*(USA|United States)$/i, "")
    .trim();
  const m = s.match(/^(.*?),\s*(.*?)[,\s]+([A-Z]{2})\.?(?:\s+(\d{5}(?:-\d{4})?))?$/);
  if (m && m[1].trim() && m[2].trim()) {
    return { street: m[1].trim(), city: m[2].trim().replace(/,$/, ""), state: m[3], zip: m[4] ?? "" };
  }
  // Não deu pra quebrar com segurança: tudo fica em Street (nada se perde).
  return { street: s, city: "", state: "", zip: "" };
}

export function composeAddress(a: AddressParts): string {
  // Só o estado (default "MA") sem rua/cidade/ZIP = endereço vazio.
  if (!a.street.trim() && !a.city.trim() && !a.zip.trim()) return "";
  return [a.street.trim(), [a.city.trim(), a.state.trim(), a.zip.trim()].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}
