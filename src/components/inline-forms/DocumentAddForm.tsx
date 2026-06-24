"use client";

import { useRef, useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { Plus, Upload, Loader2 } from "lucide-react";

// Form inline pra subir um documento direto da aba Documents do detalhe (cliente
// ou propriedade). Mesmo padrão toggle/glass das outras (NoteAddForm etc.), mas
// o upload acontece NO BROWSER (client-side) pra que o Storage RLS use a sessão
// do usuário. Só depois do upload bem-sucedido chamamos a server action que
// grava a linha em public.documents e revalida a rota.
//
// O bucket `documents` é PRIVADO: guardamos o object PATH em file_url (nunca URL
// pública). Download usa signed URL gerada na hora (ver DocumentRow).

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// Sanitiza o nome pro path de storage: só [a-zA-Z0-9._-], resto vira "_".
function safeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "");
  return cleaned || "file";
}

export function DocumentAddForm({
  parentType,
  parentId,
  action,
}: {
  parentType: "client" | "property";
  parentId: string;
  action: (fd: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentYear = new Date().getFullYear();
  const target = parentType === "client" ? "client" : "property";

  function reset() {
    setError(null);
    setBusy(false);
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const file = fileRef.current?.files?.[0] ?? null;
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File is too large. Maximum size is 25 MB.");
      return;
    }

    const yearRaw = (form.elements.namedItem("year") as HTMLInputElement | null)?.value ?? "";
    const yearNum = Number(yearRaw);
    const year = Number.isFinite(yearNum) && yearNum > 0 ? Math.trunc(yearNum) : currentYear;

    setBusy(true);
    try {
      const supabase = createClient();
      const path = `${parentType}/${parentId}/${crypto.randomUUID()}-${safeName(file.name)}`;

      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        setBusy(false);
        return;
      }

      const fd = new FormData();
      fd.set("parent_id", parentId);
      fd.set("file_url", path);
      fd.set("file_name", file.name);
      fd.set("content_type", file.type || "");
      fd.set("year", String(year));

      await action(fd);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={buttonClass("primary")}>
        <Plus className="h-4 w-4" /> Add document
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass space-y-5 p-6">
      <div className="flex items-center justify-between">
        <h3 className="h-display text-base text-ink">New document</h3>
        <span className="text-xs text-ink/45">Attached to this {target}</span>
      </div>

      <Field label="File *" hint="Up to 25 MB. PDFs, images, documents.">
        <input ref={fileRef} name="file" type="file" required className={inputClass} />
      </Field>

      <div className="sm:max-w-[12rem]">
        <Field label="Year" hint="Defaults to the current year.">
          <input
            name="year"
            type="number"
            min={2000}
            max={2100}
            defaultValue={currentYear}
            className={inputClass}
          />
        </Field>
      </div>

      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={busy} className={buttonClass("primary")}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> Upload document
            </>
          )}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className={buttonClass("ghost")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
