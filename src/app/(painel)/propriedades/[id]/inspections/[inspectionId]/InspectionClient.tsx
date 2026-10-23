"use client";

// =============================================================================
// Inspeção em RASCUNHO — feita no celular, na propriedade.
// =============================================================================
// - Cada item: Good / Needs attention / N/A (nunca yes/no).
// - Good ou Needs attention: Photo (câmera), Video (câmera), Library (galeria).
//   Foto passa pelo image-prep (HEIC -> JPEG, redimensiona) antes de subir;
//   vídeo sobe como está. Upload direto pro bucket privado via URL assinada.
// - Legenda OBRIGATÓRIA em toda foto/vídeo; nota obrigatória em Needs attention.
// - AUTOSAVE: cada mudança chama uma server action (textos com debounce). O
//   estado local é a fonte da verdade da tela (inicializado UMA vez das props),
//   então a revalidação do servidor nunca apaga o que a pessoa está digitando.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Video,
  Images,
  Trash2,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareImage } from "@/lib/image-prep";
import { buttonClass, inputClass } from "@/components/ui";
import { cx } from "@/lib/format";
import {
  RESULT_LABEL,
  groupBySection,
  validateInspection,
  type Inspection,
  type InspectionItem,
  type InspectionMedia,
  type InspectionPropertyInfo,
  type InspectionResult,
} from "@/lib/inspections";
import {
  updateInspectionFieldsAction,
  setItemResultAction,
  setItemNoteAction,
  addInspectionItemAction,
  deleteInspectionItemAction,
  getInspectionUploadUrlAction,
  addInspectionMediaAction,
  setMediaCaptionAction,
  deleteInspectionMediaAction,
  discardInspectionAction,
  finishInspectionAction,
} from "../actions";
import { MediaThumb } from "./MediaThumb";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // mesmo teto do upload de documentos
const GENERAL = "__general__";
const RESULTS: InspectionResult[] = ["good", "attention", "na"];

type SaveState = "idle" | "saving" | "saved" | "error";

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function isVideoFile(f: File): boolean {
  return (f.type || "").startsWith("video/") || /\.(mov|mp4|m4v|webm|3gp|avi)$/i.test(f.name);
}

export function InspectionClient({
  inspection,
  property,
  items: initialItems,
  media: initialMedia,
  urls: initialUrls,
}: {
  inspection: Inspection;
  property: InspectionPropertyInfo;
  items: InspectionItem[];
  media: InspectionMedia[];
  urls: Record<string, string>;
}) {
  const router = useRouter();
  const propertyHref = `/propriedades/${property.id}?tab=inspections`;
  const pdfHref = `/propriedades/${property.id}/inspections/${inspection.id}/pdf`;

  // Estado local (inicializado uma vez).
  const [inspectedOn, setInspectedOn] = useState(inspection.inspected_on);
  const [inspectedBy, setInspectedBy] = useState(inspection.inspected_by ?? "");
  const [notes, setNotes] = useState(inspection.notes ?? "");
  const [recommendations, setRecommendations] = useState(inspection.recommendations ?? "");
  const [items, setItems] = useState<InspectionItem[]>(initialItems);
  const [media, setMedia] = useState<InspectionMedia[]>(initialMedia);
  const [urls, setUrls] = useState<Record<string, string>>(initialUrls);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Record<string, number>>({});
  const [showValidation, setShowValidation] = useState(false);
  const [finishMessages, setFinishMessages] = useState<string[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");

  // ---- Autosave ---------------------------------------------------------------
  const pending = useRef(0);
  const chains = useRef(new Map<string, Promise<void>>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const queued = useRef(new Map<string, () => Promise<unknown>>());

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    pending.current += 1;
    setSaveState("saving");
    try {
      await fn();
      pending.current -= 1;
      if (pending.current === 0) setSaveState("saved");
    } catch (e) {
      pending.current -= 1;
      setSaveState("error");
      setError(errMsg(e, "Could not save. Check your connection and try again."));
    }
  }, []);

  // Encadeia por chave: duas mudanças rápidas no mesmo campo chegam em ordem.
  const enqueue = useCallback(
    (key: string, fn: () => Promise<unknown>): Promise<void> => {
      const prev = chains.current.get(key) ?? Promise.resolve();
      const next = prev.then(() => run(fn));
      chains.current.set(key, next);
      return next;
    },
    [run]
  );

  const debounced = useCallback(
    (key: string, fn: () => Promise<unknown>, ms = 800) => {
      const t = timers.current.get(key);
      if (t) clearTimeout(t);
      queued.current.set(key, fn);
      setSaveState("saving");
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          const f = queued.current.get(key);
          queued.current.delete(key);
          if (f) void enqueue(key, f);
        }, ms)
      );
    },
    [enqueue]
  );

  const flush = useCallback(
    (key: string) => {
      const t = timers.current.get(key);
      if (t) clearTimeout(t);
      timers.current.delete(key);
      const f = queued.current.get(key);
      queued.current.delete(key);
      if (f) void enqueue(key, f);
    },
    [enqueue]
  );

  // Salva tudo que está na fila e espera terminar (Finish / sair).
  const flushAll = useCallback(async () => {
    for (const key of Array.from(queued.current.keys())) flush(key);
    await Promise.all(Array.from(chains.current.values()));
  }, [flush]);

  // Aviso ao fechar a aba com algo ainda não salvo.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (pending.current > 0 || queued.current.size > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // ---- Derivados ----------------------------------------------------------------
  const groups = useMemo(() => groupBySection(items), [items]);
  const validation = useMemo(() => validateInspection(items, media), [items, media]);
  const answered = items.filter((i) => i.result).length;
  const pct = items.length ? Math.round((answered / items.length) * 100) : 0;

  const mediaByKey = useMemo(() => {
    const map = new Map<string, InspectionMedia[]>();
    // Mais novo primeiro (regra da Andrea pra listas de upload).
    const sorted = [...media].sort((a, b) => b.created_at.localeCompare(a.created_at));
    for (const m of sorted) {
      const key = m.item_id ?? GENERAL;
      const arr = map.get(key);
      if (arr) arr.push(m);
      else map.set(key, [m]);
    }
    return map;
  }, [media]);

  // ---- Handlers ------------------------------------------------------------------
  function setResult(item: InspectionItem, result: InspectionResult) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, result } : i)));
    void enqueue(`res:${item.id}`, () => setItemResultAction(item.id, result));
  }

  function setNote(item: InspectionItem, note: string) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, note } : i)));
    debounced(`note:${item.id}`, () => setItemNoteAction(item.id, note));
  }

  function setCaption(m: InspectionMedia, caption: string) {
    setMedia((prev) => prev.map((x) => (x.id === m.id ? { ...x, caption } : x)));
    debounced(`cap:${m.id}`, () => setMediaCaptionAction(m.id, caption));
  }

  function setField(key: "inspected_on" | "inspected_by" | "notes" | "recommendations", value: string) {
    if (key === "inspected_on") setInspectedOn(value);
    if (key === "inspected_by") setInspectedBy(value);
    if (key === "notes") setNotes(value);
    if (key === "recommendations") setRecommendations(value);
    if (key === "inspected_on" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const patch: { inspected_on?: string; inspected_by?: string; notes?: string; recommendations?: string } = {};
    patch[key] = value;
    debounced(`field:${key}`, () => updateInspectionFieldsAction(inspection.id, patch));
  }

  async function removeMedia(m: InspectionMedia) {
    if (!confirm("Delete this photo or video?")) return;
    const t = timers.current.get(`cap:${m.id}`);
    if (t) clearTimeout(t);
    timers.current.delete(`cap:${m.id}`);
    queued.current.delete(`cap:${m.id}`);
    setMedia((prev) => prev.filter((x) => x.id !== m.id));
    await enqueue(`media:${m.id}`, () => deleteInspectionMediaAction(m.id));
  }

  async function removeItem(item: InspectionItem) {
    const count = mediaByKey.get(item.id)?.length ?? 0;
    const extra = count ? ` Its ${count} photo${count === 1 ? "" : "s"}/video${count === 1 ? "" : "s"} will be deleted too.` : "";
    if (!confirm(`Remove "${item.label}" from this inspection?${extra}`)) return;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setMedia((prev) => prev.filter((m) => m.item_id !== item.id));
    await enqueue(`item:${item.id}`, () => deleteInspectionItemAction(item.id));
  }

  async function addItem(section: string) {
    const label = newLabel.trim();
    if (!label) return;
    setError(null);
    try {
      const created = await addInspectionItemAction(inspection.id, section, label);
      setItems((prev) => [...prev, created]);
      setNewLabel("");
      setAddingTo(null);
    } catch (e) {
      setError(errMsg(e, "Could not add the item."));
    }
  }

  async function uploadFiles(itemId: string | null, files: File[]) {
    const key = itemId ?? GENERAL;
    setError(null);
    for (const file of files) {
      setUploading((u) => ({ ...u, [key]: (u[key] ?? 0) + 1 }));
      try {
        const video = isVideoFile(file);
        let body: Blob;
        let ext: string;
        let contentType: string;
        if (video) {
          if (file.size > MAX_VIDEO_BYTES) {
            throw new Error(`"${file.name}" is too large. Videos can be up to 50 MB; record a shorter clip.`);
          }
          body = file;
          ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "mp4").toLowerCase();
          contentType = file.type || "video/mp4";
        } else {
          const prepared = await prepareImage(file);
          body = prepared.blob;
          ext = "jpg";
          contentType = "image/jpeg";
        }
        const { path, token } = await getInspectionUploadUrlAction(inspection.id, ext);
        const supabase = createClient();
        const { error: upErr } = await supabase.storage
          .from("documents")
          .uploadToSignedUrl(path, token, body, { contentType });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        const res = await addInspectionMediaAction({
          inspectionId: inspection.id,
          itemId,
          path,
          kind: video ? "video" : "photo",
        });
        setMedia((prev) => [res.media, ...prev]);
        if (res.url) {
          const signed = res.url;
          setUrls((prev) => ({ ...prev, [path]: signed }));
        }
        setSaveState("saved");
      } catch (e) {
        setError(errMsg(e, "Upload failed. Try again."));
      } finally {
        setUploading((u) => ({ ...u, [key]: Math.max(0, (u[key] ?? 1) - 1) }));
      }
    }
  }

  async function saveAndLeave() {
    setLeaving(true);
    await flushAll();
    router.push(propertyHref);
    router.refresh();
  }

  async function discard() {
    if (!confirm("Discard this draft inspection? All answers, photos and videos in it will be deleted.")) return;
    setError(null);
    try {
      await discardInspectionAction(inspection.id);
      router.push(propertyHref);
      router.refresh();
    } catch (e) {
      setError(errMsg(e, "Could not discard the draft."));
    }
  }

  async function finish() {
    setError(null);
    setFinishMessages([]);
    await flushAll();
    const v = validateInspection(items, media);
    if (!v.ok) {
      setShowValidation(true);
      setFinishMessages(v.messages);
      const firstItem = items.find((i) => v.itemErrors[i.id]);
      const firstMedia = media.find((m) => v.mediaErrors[m.id]);
      const target = firstItem
        ? document.getElementById(`item-${firstItem.id}`)
        : firstMedia
        ? document.getElementById(`media-${firstMedia.id}`)
        : null;
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setFinishing(true);
    try {
      const res = await finishInspectionAction(inspection.id);
      if (!res.ok) {
        setShowValidation(true);
        setFinishMessages(res.messages);
        setFinishing(false);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(errMsg(e, "Could not finish the inspection. Try again."));
      setFinishing(false);
    }
  }

  // ---- Peças de UI -----------------------------------------------------------------
  const chip =
    "inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-black/[0.10] bg-white px-3 py-2 text-xs font-semibold text-ink/75 transition hover:border-primary/40 hover:text-primary";

  // Função de render (NÃO um componente aninhado): um componente definido aqui
  // seria recriado a cada render e o input de legenda perderia o foco.
  function renderMedia(itemId: string | null) {
    const key = itemId ?? GENERAL;
    const list = mediaByKey.get(key) ?? [];
    const busy = uploading[key] ?? 0;
    const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      e.target.value = "";
      if (files.length) void uploadFiles(itemId, files);
    };
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <label className={chip}>
            <Camera className="h-4 w-4" /> Photo
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
          </label>
          <label className={chip}>
            <Video className="h-4 w-4" /> Video
            <input type="file" accept="video/*" capture="environment" className="hidden" onChange={pick} />
          </label>
          <label className={chip}>
            <Images className="h-4 w-4" /> Library
            <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={pick} />
          </label>
          {busy > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink/55">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading {busy}…
            </span>
          )}
        </div>
        {list.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {list.map((m) => {
              const missing = showValidation && !!validation.mediaErrors[m.id];
              return (
                <div key={m.id} id={`media-${m.id}`} className="space-y-1.5">
                  <div className="relative">
                    <MediaThumb media={m} url={urls[m.storage_path] ?? null} />
                    <button
                      type="button"
                      onClick={() => void removeMedia(m)}
                      className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-red-600 shadow"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    value={m.caption}
                    onChange={(e) => setCaption(m, e.target.value)}
                    onBlur={() => flush(`cap:${m.id}`)}
                    placeholder="Caption: where is this? e.g. hallway bathroom ceiling"
                    className={cx(inputClass, "px-2.5 py-2 text-xs", missing && "border-red-400 ring-2 ring-red-100")}
                  />
                  {missing && <p className="text-[11px] font-medium text-red-600">Caption required.</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const resultBtn = (r: InspectionResult, active: boolean) =>
    cx(
      "rounded-xl border px-2 py-2.5 text-xs font-bold transition sm:text-sm",
      !active && "border-black/[0.10] bg-white text-ink/65 hover:border-black/25",
      active && r === "good" && "border-primary bg-primary text-white",
      active && r === "attention" && "border-orange-500 bg-orange-500 text-white",
      active && r === "na" && "border-ink/40 bg-ink/70 text-white"
    );

  return (
    <div className="space-y-5 pb-10">
      {/* Cabeçalho */}
      <div className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Property inspection · Draft</p>
        <h1 className="h-display mt-1 text-xl text-ink sm:text-2xl">{property.address}</h1>
        <p className="mt-1 text-sm text-ink/55">Owner: {property.ownerName ?? "—"}</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink/50">Inspection date</span>
            <input
              type="date"
              value={inspectedOn}
              onChange={(e) => setField("inspected_on", e.target.value)}
              onBlur={() => flush("field:inspected_on")}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink/50">Inspected by</span>
            <input
              value={inspectedBy}
              onChange={(e) => setField("inspected_by", e.target.value)}
              onBlur={() => flush("field:inspected_by")}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      {/* Progresso (fixo no topo ao rolar) */}
      <div className="sticky top-[61px] z-20 rounded-2xl border border-black/[0.08] bg-white/95 px-4 py-3 shadow-card backdrop-blur md:top-0">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-ink">
            {answered}/{items.length} answered
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-ink/50">
            {saveState === "saving" && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </>
            )}
            {saveState === "saved" && (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Saved
              </>
            )}
            {saveState === "error" && (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-red-600" /> Not saved
              </>
            )}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Seções */}
      {groups.map((g) => {
        const done = g.items.filter((i) => i.result).length;
        return (
          <section key={g.section} className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="h-display text-base text-ink">{g.section}</h2>
              <span className={cx("text-xs font-semibold", done === g.items.length ? "text-primary" : "text-ink/45")}>
                {done}/{g.items.length}
              </span>
            </div>
            {g.items.map((item) => {
              const errs = showValidation ? validation.itemErrors[item.id] ?? [] : [];
              const hasMedia = (mediaByKey.get(item.id)?.length ?? 0) > 0;
              const showMedia = item.result === "good" || item.result === "attention" || hasMedia;
              const showNote = item.result === "good" || item.result === "attention";
              return (
                <div
                  key={item.id}
                  id={`item-${item.id}`}
                  className={cx(
                    "space-y-3 rounded-2xl border bg-white p-4 shadow-card",
                    errs.length ? "border-red-300" : "border-black/[0.08]"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{item.label}</p>
                    <button
                      type="button"
                      onClick={() => void removeItem(item)}
                      className="shrink-0 rounded-lg p-1 text-ink/30 transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${item.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {RESULTS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setResult(item, r)}
                        className={resultBtn(r, item.result === r)}
                        aria-pressed={item.result === r}
                      >
                        {RESULT_LABEL[r]}
                      </button>
                    ))}
                  </div>
                  {showNote && (
                    <textarea
                      rows={item.result === "attention" ? 2 : 1}
                      value={item.note ?? ""}
                      onChange={(e) => setNote(item, e.target.value)}
                      onBlur={() => flush(`note:${item.id}`)}
                      placeholder={
                        item.result === "attention"
                          ? "Required: describe the issue (e.g. slow leak under the sink)"
                          : "Note (optional)"
                      }
                      className={cx(
                        inputClass,
                        showValidation &&
                          item.result === "attention" &&
                          !(item.note ?? "").trim() &&
                          "border-red-400 ring-2 ring-red-100"
                      )}
                    />
                  )}
                  {showMedia && renderMedia(item.id)}
                  {errs.length > 0 && (
                    <ul className="space-y-0.5 text-xs font-medium text-red-600">
                      {errs.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {addingTo === g.section ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addItem(g.section);
                    }
                  }}
                  placeholder={`New item in ${g.section}`}
                  className={inputClass}
                />
                <button type="button" onClick={() => void addItem(g.section)} className={buttonClass("primary")}>
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingTo(null);
                    setNewLabel("");
                  }}
                  className={buttonClass("ghost")}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAddingTo(g.section);
                  setNewLabel("");
                }}
                className="inline-flex items-center gap-1.5 px-1 text-xs font-semibold text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add item to {g.section}
              </button>
            )}
          </section>
        );
      })}

      {/* Fotos/vídeos gerais */}
      <section className="space-y-3 rounded-2xl border border-black/[0.08] bg-white p-4 shadow-card">
        <div>
          <h2 className="h-display text-base text-ink">General photos and videos</h2>
          <p className="text-xs text-ink/50">Overall views of the property. Every photo and video needs a caption.</p>
        </div>
        {renderMedia(null)}
      </section>

      {/* Textos finais */}
      <section className="space-y-4 rounded-2xl border border-black/[0.08] bg-white p-4 shadow-card">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink/50">
            Inspection notes and observations
          </span>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setField("notes", e.target.value)}
            onBlur={() => flush("field:notes")}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink/50">
            Maintenance recommendations
          </span>
          <textarea
            rows={4}
            value={recommendations}
            onChange={(e) => setField("recommendations", e.target.value)}
            onBlur={() => flush("field:recommendations")}
            className={inputClass}
          />
        </label>
      </section>

      {/* Ações */}
      <section className="space-y-3">
        {finishMessages.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-semibold">Before finishing:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {finishMessages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          onClick={() => void finish()}
          disabled={finishing || leaving}
          className={cx(buttonClass("primary"), "w-full py-3 text-base disabled:opacity-60")}
        >
          {finishing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Creating the PDF…
            </>
          ) : (
            "Finish and create PDF"
          )}
        </button>
        <button
          type="button"
          onClick={() => void saveAndLeave()}
          disabled={finishing || leaving}
          className={cx(buttonClass("ghost"), "w-full py-3 disabled:opacity-60")}
        >
          {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save draft, finish later
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1">
          <a
            href={pdfHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink/55 hover:text-primary"
          >
            <FileText className="h-3.5 w-3.5" /> Preview PDF
          </a>
          <button
            type="button"
            onClick={() => void discard()}
            disabled={finishing || leaving}
            className="text-xs font-semibold text-red-600 hover:underline"
          >
            Discard draft
          </button>
        </div>
      </section>
    </div>
  );
}
