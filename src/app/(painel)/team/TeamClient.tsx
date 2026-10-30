"use client";

// =============================================================================
// Editor da seção "Meet the Team". Upload de headshot (prepara no navegador,
// sobe direto pro bucket público team-photos), editar nome/título/bio, arrastar
// pra reordenar, publicar/ocultar, remover. Mesmo padrão da galeria de listing.
// =============================================================================
import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { prepareImage, ACCEPTED_IMAGE_TYPES } from "@/lib/image-prep";
import { cx } from "@/lib/format";
import { ImagePlus, Loader2, Trash2, AlertCircle, GripVertical, Eye, EyeOff, UserPlus } from "lucide-react";

export type TeamMemberRow = {
  id: string;
  name: string;
  title: string;
  bio: string | null;
  photo_url: string | null;
  storage_path: string | null;
  initials: string | null;
  sort_order: number;
  published: boolean;
};

type Action = (fd: FormData) => void | Promise<void>;
const BUCKET = "team-photos";

export function TeamClient({
  members,
  createAction,
  updateAction,
  setPhotoAction,
  removePhotoAction,
  deleteAction,
  reorderAction,
  togglePublishedAction,
}: {
  members: TeamMemberRow[];
  createAction: Action;
  updateAction: Action;
  setPhotoAction: Action;
  removePhotoAction: Action;
  deleteAction: Action;
  reorderAction: Action;
  togglePublishedAction: Action;
}) {
  const [items, setItems] = useState<TeamMemberRow[]>(members);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => setItems(members), [members]);

  function run(action: Action, fd: FormData, msg: string) {
    setError(null);
    start(async () => {
      try {
        await action(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : msg);
      }
    });
  }

  async function onPickPhoto(m: TeamMemberRow, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusyId(m.id);
    try {
      const prepared = await prepareImage(file);
      const supabase = createClient();
      const path = `${m.id}/${Date.now()}-${prepared.fileName}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, prepared.blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const fd = new FormData();
      fd.set("id", m.id);
      fd.set("photo_url", pub.publicUrl);
      fd.set("storage_path", path);
      await setPhotoAction(fd);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That photo could not be uploaded.");
    } finally {
      setBusyId(null);
    }
  }

  function saveField(m: TeamMemberRow, patch: Partial<TeamMemberRow>) {
    const name = (patch.name ?? m.name).trim();
    const title = (patch.title ?? m.title).trim();
    const bio = (patch.bio ?? m.bio ?? "").trim();
    if (!name || !title) {
      setError("Name and title can't be empty.");
      return;
    }
    // só grava se algo mudou de verdade
    if (name === m.name && title === m.title && bio === (m.bio ?? "")) return;
    const fd = new FormData();
    fd.set("id", m.id);
    fd.set("name", name);
    fd.set("title", title);
    fd.set("bio", bio);
    run(updateAction, fd, "Could not save that change.");
  }

  function persistOrder(next: TeamMemberRow[]) {
    setItems(next);
    const fd = new FormData();
    fd.set("order", next.map((x) => x.id).join(","));
    run(reorderAction, fd, "Could not save the new order.");
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return setDragId(null);
    const dragItem = items.find((x) => x.id === dragId);
    if (!dragItem) return;
    const without = items.filter((x) => x.id !== dragId);
    const idx = without.findIndex((x) => x.id === targetId);
    persistOrder([...without.slice(0, idx), dragItem, ...without.slice(idx)]);
    setDragId(null);
  }

  function addMember() {
    if (!newName.trim() || !newTitle.trim()) {
      setError("A new member needs a name and a title.");
      return;
    }
    const fd = new FormData();
    fd.set("name", newName.trim());
    fd.set("title", newTitle.trim());
    run(createAction, fd, "Could not add that member.");
    setNewName("");
    setNewTitle("");
  }

  const input =
    "w-full rounded-lg border border-black/[0.10] bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

  return (
    <div>
      {error && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {/* Add member */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-black/[0.08] bg-black/[0.015] p-4">
        <label className="grid flex-1 gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/55">Name</span>
          <input className={input} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Jane Smith" />
        </label>
        <label className="grid flex-1 gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/55">Title</span>
          <input className={input} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Realtor" />
        </label>
        <button
          type="button"
          onClick={addMember}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-secondary px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(25,133,119,0.55)] transition hover:scale-[1.02] disabled:opacity-60"
        >
          <UserPlus className="h-4 w-4" /> Add member
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/[0.12] bg-black/[0.015] px-4 py-8 text-center text-sm text-ink/50">
          No team members yet. Add the first one above.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((m) => (
            <TeamRow
              key={m.id}
              m={m}
              input={input}
              busy={busyId === m.id || pending}
              isDragging={dragId === m.id}
              onDragStart={() => setDragId(m.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(m.id)}
              onDragEnd={() => setDragId(null)}
              onPickPhoto={(e) => onPickPhoto(m, e)}
              onRemovePhoto={() => {
                const fd = new FormData();
                fd.set("id", m.id);
                run(removePhotoAction, fd, "Could not remove the photo.");
              }}
              onSaveField={(patch) => saveField(m, patch)}
              onTogglePublished={() => {
                const fd = new FormData();
                fd.set("id", m.id);
                fd.set("published", m.published ? "false" : "true");
                run(togglePublishedAction, fd, "Could not change visibility.");
              }}
              onDelete={() => {
                if (!confirm(`Remove ${m.name} from the team?`)) return;
                const fd = new FormData();
                fd.set("id", m.id);
                run(deleteAction, fd, "Could not remove that member.");
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamRow({
  m,
  input,
  busy,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onPickPhoto,
  onRemovePhoto,
  onSaveField,
  onTogglePublished,
  onDelete,
}: {
  m: TeamMemberRow;
  input: string;
  busy: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onPickPhoto: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: () => void;
  onSaveField: (patch: Partial<TeamMemberRow>) => void;
  onTogglePublished: () => void;
  onDelete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(m.name);
  const [title, setTitle] = useState(m.title);
  const [bio, setBio] = useState(m.bio ?? "");

  useEffect(() => {
    setName(m.name);
    setTitle(m.title);
    setBio(m.bio ?? "");
  }, [m.name, m.title, m.bio]);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cx(
        "flex flex-wrap items-start gap-4 rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(15,27,25,0.04)] transition",
        isDragging ? "border-primary/40 opacity-50" : "border-black/[0.08]",
        !m.published && "opacity-70"
      )}
    >
      <span className="mt-1 cursor-grab text-ink/30 active:cursor-grabbing" title="Drag to reorder">
        <GripVertical className="h-5 w-5" />
      </span>

      {/* Photo / avatar */}
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-black/[0.08] bg-black/[0.03]">
        {m.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.photo_url} alt={m.name} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-lg font-bold text-primary">
            {m.initials || "?"}
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-white/60">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </span>
        )}
      </div>

      <div className="flex min-w-[200px] flex-1 flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <input
            className={cx(input, "flex-1")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => onSaveField({ name })}
            placeholder="Name"
          />
          <input
            className={cx(input, "flex-1")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => onSaveField({ title })}
            placeholder="Title"
          />
        </div>
        <textarea
          className={cx(input, "resize-y")}
          rows={2}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          onBlur={() => onSaveField({ bio })}
          placeholder="Short bio (optional)"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES} onChange={onPickPhoto} className="hidden" />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.10] bg-white px-3 py-1.5 text-xs font-semibold text-ink/80 transition hover:border-black/20 hover:bg-black/[0.03] disabled:opacity-60"
          >
            <ImagePlus className="h-3.5 w-3.5" /> {m.photo_url ? "Replace photo" : "Upload photo"}
          </button>
          {m.photo_url && (
            <button
              type="button"
              disabled={busy}
              onClick={onRemovePhoto}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.10] bg-white px-3 py-1.5 text-xs font-semibold text-ink/60 transition hover:text-ink disabled:opacity-60"
            >
              Remove photo
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onTogglePublished}
            title={m.published ? "Visible on the website" : "Hidden from the website"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.10] bg-white px-3 py-1.5 text-xs font-semibold text-ink/70 transition hover:text-ink disabled:opacity-60"
          >
            {m.published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {m.published ? "Published" : "Hidden"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            aria-label={`Remove ${m.name}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}
