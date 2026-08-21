"use client";

// =============================================================================
// Galeria de fotos da listing — upload direto do celular/computador.
// =============================================================================
// A Andrea fotografa com iPhone, então chega HEIC (que navegador não abre) e
// JPG de 8 MB. O preparo acontece AQUI no navegador antes de subir:
// HEIC→JPEG + redimensiona (src/lib/image-prep.ts). O que chega no bucket é
// sempre JPEG web-ready.
//
// Bytes vão DIRETO pro storage com a sessão do usuário (RLS de storage exige
// listings.manage) — não passam por server action, então nada de limite de
// payload da Vercel.
//
// A PRIMEIRA foto é a capa: é ela que o site mostra no card. Um trigger no
// banco mantém listings.cover_photo_url apontando pra primeira, então "Make
// cover" é só reordenar.
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { ImagePlus, Loader2, Trash2, Star, AlertCircle } from "lucide-react";
import { cx } from "@/lib/format";
import { prepareImage, ACCEPTED_IMAGE_TYPES } from "@/lib/image-prep";
import type { ListingPhoto } from "@/lib/types";

type Action = (fd: FormData) => void | Promise<void>;
const BUCKET = "listing-photos";

export function ListingPhotos({
  listingId,
  photos,
  canManage,
  addAction,
  deleteAction,
  reorderAction,
}: {
  listingId: string;
  photos: ListingPhoto[];
  canManage: boolean;
  addAction: Action;
  deleteAction: Action;
  reorderAction: Action;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    const supabase = createClient();

    // Uma de cada vez: converter HEIC é pesado e assim a mensagem de progresso
    // diz exatamente qual foto está sendo processada.
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        setBusy(`Preparing ${file.name} (${i + 1} of ${files.length})…`);
        const prepared = await prepareImage(file);

        setBusy(`Uploading ${file.name} (${i + 1} of ${files.length})…`);
        const path = `${listingId}/${Date.now()}-${prepared.fileName}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, prepared.blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw new Error(upErr.message);

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

        const fd = new FormData();
        fd.set("listing_id", listingId);
        fd.set("storage_path", path);
        fd.set("url", pub.publicUrl);
        await addAction(fd);
      } catch (err) {
        setError(
          err instanceof Error
            ? `${file.name}: ${err.message}`
            : `${file.name} could not be added.`
        );
        break; // para no primeiro erro em vez de despejar N mensagens iguais
      }
    }

    setBusy(null);
    if (fileRef.current) fileRef.current.value = ""; // permite re-escolher o mesmo arquivo
  }

  function remove(p: ListingPhoto) {
    setError(null);
    const fd = new FormData();
    fd.set("id", p.id);
    start(async () => {
      try {
        await deleteAction(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove that photo.");
      }
    });
  }

  // "Make cover" = mandar essa foto pro início da ordem.
  function makeCover(p: ListingPhoto) {
    setError(null);
    const rest = photos.filter((x) => x.id !== p.id).map((x) => x.id);
    const fd = new FormData();
    fd.set("listing_id", listingId);
    fd.set("order", [p.id, ...rest].join(","));
    start(async () => {
      try {
        await reorderAction(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not change the cover photo.");
      }
    });
  }

  const working = busy !== null || pending;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Photos</p>
          <p className="mt-0.5 text-xs text-ink/45">
            The first photo is the cover shown on the website. iPhone photos (HEIC) are converted
            automatically.
          </p>
        </div>
        {canManage && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              multiple
              onChange={onPick}
              className="hidden"
            />
            <button
              type="button"
              disabled={working}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-black/[0.10] bg-white px-4 py-2 text-sm text-ink/80 transition hover:border-black/20 hover:bg-black/[0.03] disabled:opacity-60"
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              Add photos
            </button>
          </>
        )}
      </div>

      {busy && (
        <p className="mb-3 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.05] px-3.5 py-2.5 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" /> {busy}
        </p>
      )}
      {error && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {photos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/[0.12] bg-black/[0.015] px-4 py-8 text-center text-sm text-ink/50">
          No photos yet.{canManage ? " Add the first one — it becomes the cover." : ""}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p, i) => (
            <div
              key={p.id}
              className={cx(
                "group relative aspect-[4/3] overflow-hidden rounded-xl border bg-black/[0.03]",
                i === 0 ? "border-primary/40 ring-2 ring-primary/20" : "border-black/[0.08]"
              )}
            >
              {/* next/image exigiria configurar o host remoto; <img> é o certo
                  aqui — é um thumbnail interno, não uma imagem do site. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />

              {i === 0 && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">
                  <Star className="h-3 w-3 fill-white" /> Cover
                </span>
              )}

              {canManage && (
                <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  {i !== 0 && (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => makeCover(p)}
                      className="rounded-lg bg-white/90 px-2 py-1 text-[11px] font-semibold text-ink transition hover:bg-white disabled:opacity-60"
                    >
                      Make cover
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => remove(p)}
                    aria-label="Remove photo"
                    className="ml-auto rounded-lg bg-white/90 p-1.5 text-red-600 transition hover:bg-white disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
