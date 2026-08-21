// Shim de tipos pro heic2any (conversão HEIC→JPEG no navegador).
//
// Por que existe: o tsconfig roda com `strict: true`, então um pacote sem
// declaração de tipos quebraria o build (TS7016) — e aqui a Vercel é o ÚNICO
// compilador (a máquina da Andrea não tem Node). Declarar a assinatura que a
// gente realmente usa deixa o build determinístico, tenha o pacote tipos
// próprios ou não.
declare module "heic2any" {
  interface Heic2AnyOptions {
    blob: Blob;
    toType?: string;
    quality?: number;
    multiple?: boolean;
  }
  // Devolve Blob[] quando o HEIC carrega mais de uma imagem dentro.
  export default function heic2any(options: Heic2AnyOptions): Promise<Blob | Blob[]>;
}
