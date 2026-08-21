// =============================================================================
// By the C — Preparo de imagem no NAVEGADOR, antes de subir pro storage.
// =============================================================================
// Por que existe: a Andrea fotografa com iPhone, então os arquivos vêm em HEIC
// (e às vezes JPG gigante de 8 MB). Navegador NÃO renderiza HEIC — subir o
// arquivo cru deixaria a foto "quebrada" no site pra quase todo visitante.
//
// Então, do lado do cliente (sem custo de servidor, sem estourar o limite de
// payload da Vercel):
//   1. HEIC/HEIF  → JPEG (heic2any, importado dinamicamente: a lib só entra no
//                   bundle quando alguém realmente escolhe um HEIC)
//   2. qualquer   → redimensiona pro lado maior = MAX_EDGE e re-encoda JPEG
//                   (foto de listing não precisa de 4032px; o site fica leve)
//
// Sempre devolve JPEG, então o que chega no bucket abre em qualquer navegador.
// =============================================================================

const MAX_EDGE = 2000; // px no lado maior
const QUALITY = 0.82; // bom equilíbrio nitidez × peso pra foto de imóvel

export const ACCEPTED_IMAGE_TYPES =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

// O iOS às vezes manda type vazio ou "application/octet-stream" num HEIC, então
// a extensão também conta.
function isHeic(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "image/heic" || t === "image/heif") return true;
  return /\.(heic|heif)$/i.test(file.name);
}

function baseName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "");
  const cleaned = stem
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+/, "");
  return (cleaned || "photo").slice(0, 60);
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}

export interface PreparedImage {
  blob: Blob;
  fileName: string; // sempre .jpg
  width: number;
  height: number;
  converted: boolean; // veio de HEIC? (pra avisar na UI)
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const converted = isHeic(file);
  let source: Blob = file;

  if (converted) {
    // Import dinâmico: só carrega a lib (pesada) quando tem HEIC de verdade.
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: QUALITY });
    // heic2any devolve Blob ou Blob[] (HEIC pode conter várias imagens; a capa
    // é a primeira).
    source = Array.isArray(out) ? out[0] : (out as Blob);
  }

  const img = await loadImage(source);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image in this browser.");
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );
  if (!blob) throw new Error("Could not process the image in this browser.");

  return { blob, fileName: `${baseName(file.name)}.jpg`, width: w, height: h, converted };
}
