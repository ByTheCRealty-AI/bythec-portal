"use client";

// =============================================================================
// Galeria de fotos da listing — upload + REORDENAR (arrastar) + LEGENDAS.
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
// ORDEM: arrasta pra reordenar (a 1ª é a capa). Um trigger no banco mantém
// listings.cover_photo_url apontando pra primeira. LEGENDA: campo por foto,
// salva ao sair do campo; aparece embaixo da foto na galeria do site.
import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { ImagePlus, Loader2, Trash2, Star, AlertCircle, GripVertical } from "lucide-react";
import { cx } from "@/lib/format";
import { prepareImage, ACCEPTED_IMAGE_TYPES } from "@/lib/image-prep";
import type { ListingPhoto } from "@/lib/types";
import { updateListingPhotoCaptionAction } from "./actions";

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

  // Cópia local pra UI otimista (reordenar sem esperar o round-trip). Sincroniza
  // sempre que o servidor devolve a lista nova (revalidatePath).
  const [items, setItems] = useState<ListingPhoto[]>(photos);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    setItems(photos);
    setCaptions(Object.fromEntries(photos.map((p) => [p.id, p.caption ?? ""])));
  }, [photos]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    const supabase = createClient();

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
          err instanceof Error ? `${file.name}: ${err.message}` : `${file.name} could not be added.`
        );
        break;
      }
    }

    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
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

  // Persiste a ordem nova (lista de ids). Atualiza a UI na hora e grava.
  function persistOrder(next: ListingPhoto[]) {
    setItems(next);
    const fd = new FormData();
    fd.set("listing_id", listingId);
    fd.set("order", next.map((x) => x.id).join(","));
    start(async () => {
      try {
        await reorderAction(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the new order.");
      }
    });
  }

  function makeCover(p: ListingPhoto) {
    setError(null);
    persistOrder([p, ...items.filter((x) => x.id !== p.id)]);
  }

  // --- Drag to reorder (desktop) --------------------------------------------
  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const dragItem = items.find((x) => x.id === dragId);
    if (!dragItem) return;
    const without = items.filter((x) => x.id !== dragId);
    const targetIndex = without.findIndex((x) => x.id === targetId);
    const next = [...without.slice(0, targetIndex), dragItem, ...without.slice(targetIndex)];
    setDragId(null);
    persistOrder(next);
  }

  // --- Captions --------------------------------------------------------------
  function saveCaption(p: ListingPhoto) {
    const value = (captions[p.id] ?? "").trim();
    if (value === (p.caption ?? "")) return; // nada mudou
    const fd = new FormData();
    fd.set("id", p.id);
    fd.set("caption", value);
    start(async () => {
      try {
        await updateListingPhotoCaptionAction(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the caption.");
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
            Drag to reorder — the first photo is the cover shown on the website. Add a caption under any
            photo. iPhone photos (HEIC) are converted automatically.
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

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/[0.12] bg-black/[0.015] px-4 py-8 text-center text-sm text-ink/50">
          No photos yet.{canManage ? " Add the first one — it becomes the cover." : ""}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((p, i) => (
            <div
              key={p.id}
              draggable={canManage}
              onDragStart={() => canManage && setDragId(p.id)}
              onDragOver={(e) => canManage && e.preventDefault()}
              onDrop={() => canManage && onDrop(p.id)}
              onDragEnd={() => setDragId(null)}
              className={cx("flex flex-col gap-1.5", dragId === p.id && "opacity-50")}
            >
              <div
                className={cx(
                  "group relative aspect-[4/3] overflow-hidden rounded-xl border bg-black/[0.03]",
                  i === 0 ? "border-primary/40 ring-2 ring-primary/20" : "border-black/[0.08]",
                  canManage && "cursor-grab active:cursor-grabbing"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" draggable={false} className="h-full w-full object-cover" loading="lazy" />

                {i === 0 && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">
                    <Star className="h-3 w-3 fill-white" /> Cover
                  </span>
                )}
                {canManage && (
                  <span className="absolute right-2 top-2 rounded-md bg-black/45 p-1 text-white opacity-0 transition group-hover:opacity-100">
                    <GripVertical className="h-3.5 w-3.5" />
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

              {canManage ? (
                <input
                  type="text"
                  value={captions[p.id] ?? ""}
                  onChange={(e) => setCaptions((c) => ({ ...c, [p.id]: e.target.value }))}
                  onBlur={() => saveCaption(p)}
                  placeholder="Add a caption…"
                  maxLength={160}
                  className="w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs text-ink/80 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              ) : (
                p.caption && <p className="px-0.5 text-xs text-ink/55">{p.caption}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
