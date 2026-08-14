// =============================================================================
// By the C — SSN/ITIN encryption (server-only) · AES-256-GCM
// =============================================================================
// A aplicação pública de aluguel coleta SSN/ITIN. NUNCA guardamos em texto puro.
// Aqui cifra-se com AES-256-GCM usando uma chave de 32 bytes vinda do ambiente
// (APPLICATION_ENCRYPTION_KEY), NUNCA commitada, NUNCA com prefixo NEXT_PUBLIC_.
//
// Formato do blob guardado (base64 de campos concatenados):
//   base64( iv(12 bytes) || authTag(16 bytes) || ciphertext )
// Decifra só server-side, numa action gated por has_cap('applications.manage').
//
// A chave aceita 3 formatos no env (detectados por tamanho): 64 hex chars,
// base64 de 32 bytes, ou 32 chars ASCII. Gera uma com:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// =============================================================================

import "server-only";
import crypto from "node:crypto";

const IV_BYTES = 12; // padrão GCM
const KEY_BYTES = 32; // AES-256

function loadKey(): Buffer {
  const raw = process.env.APPLICATION_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "APPLICATION_ENCRYPTION_KEY ausente. Configure no Vercel (Project Settings · " +
        "Environment Variables) uma chave de 32 bytes. Gere com: " +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  const s = raw.trim();

  // 64 chars hex -> 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, "hex");

  // base64 que dá exatamente 32 bytes
  try {
    const b = Buffer.from(s, "base64");
    if (b.length === KEY_BYTES) return b;
  } catch {
    /* cai pro próximo formato */
  }

  // 32 chars ASCII literais
  const ascii = Buffer.from(s, "utf8");
  if (ascii.length === KEY_BYTES) return ascii;

  throw new Error(
    "APPLICATION_ENCRYPTION_KEY inválida: precisa resolver pra 32 bytes " +
      "(64 hex, base64 de 32 bytes, ou 32 caracteres ASCII)."
  );
}

// Cifra um valor sensível. Retorna o blob base64 pra gravar em ssn_encrypted.
export function encryptSensitive(plain: string): string {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

// Decifra o blob base64. Lança se a chave/blob não baterem (tag inválida).
export function decryptSensitive(blob: string): string {
  const key = loadKey();
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + 16);
  const ct = buf.subarray(IV_BYTES + 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// Só os 4 últimos dígitos (guardado à parte pra exibir sem decifrar).
export function last4(digitsOrRaw: string): string {
  const digits = digitsOrRaw.replace(/\D/g, "");
  return digits.slice(-4);
}
