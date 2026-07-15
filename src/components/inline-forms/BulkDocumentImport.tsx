"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { FolderUp, Loader2, Check, AlertTriangle, ChevronDown } from "lucide-react";

// Bulk import de documentos de uma pasta (OneDrive) PRA UMA propriedade. Tudo no
// browser, com a sessão da usuária (Storage RLS aplica). A usuária escolhe a pasta
// da propriedade; nós filtramos (fotos/vídeos/templates fora), detectamos as
// subpastas por inquilino, ela confirma o mapeamento, e subimos + gravamos as rows.
// Os ARQUIVOS sobem client-side; as ROWS são gravadas por importPropertyDocumentsAction.

type TenantOption = { id: string; name: string; archived: boolean };
type Mapping = {
  belongs: "property" | "current" | "past";
  pastMode: "existing" | "free";
  tenantId: string;
  label: string;
};
type ParsedFile = {
  file: File;
  name: string;
  subfolder: string; // "" = directly in the property folder (property-level)
  rel: string; // path relative to the picked folder (source_path)
  docDate: string; // YYYY-MM-DD from the file's modified time
};
type SkipItem = { name: string; reason: string };
type ImportMeta = {
  file_url: string;
  file_name: string;
  content_type: string | null;
  doc_date: string | null;
  source_path: string;
  belongs_to: "property" | "current" | "past_existing" | "past_free";
  tenant_id: string | null;
  tenant_label: string | null;
};

const SKIP_EXT = new Set([
  "mov", "mp4", "heic", "ds_store", "url", "css", "html", "php", "download", "tif", "gif", "webp",
]);

function isTemplateName(name: string): boolean {
  const b = name.toLowerCase();
  return (
    b === "blank maintenance record.xlsx" ||
    b === "by the c realty.jpg" ||
    b === "by the c.png" ||
    b.startsWith("logo") ||
    b.includes("master") ||
    b.startsWith("letterhead") ||
    b.startsWith("watermark") ||
    b.startsWith("envelope model")
  );
}

function safeName(name: string): string {
  const c = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "");
  return c || "file";
}

// Tokens significativos de um nome (ignora "uploaded", parênteses etc.) pra casar
// nome de subpasta com cliente.
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !["uploaded", "the", "and", "documents"].includes(t));
}

function cleanLabel(sub: string): string {
  return sub.replace(/^uploaded\s*\(/i, "").replace(/\)\s*$/, "").trim() || sub;
}

function defaultMapping(
  sub: string,
  currentTenant: { id: string; name: string } | null,
  tenantOptions: TenantOption[]
): Mapping {
  const subTok = tokens(sub);
  const match =
    subTok.length > 0
      ? tenantOptions.find((t) => {
          const ct = tokens(t.name);
          return subTok.every((x) => ct.includes(x));
        })
      : undefined;
  if (match && currentTenant && match.id === currentTenant.id) {
    return { belongs: "current", pastMode: "existing", tenantId: "", label: "" };
  }
  if (match) {
    return { belongs: "past", pastMode: "existing", tenantId: match.id, label: "" };
  }
  return { belongs: "past", pastMode: "free", tenantId: "", label: cleanLabel(sub) };
}

export function BulkDocumentImport({
  propertyId,
  currentTenant = null,
  tenantOptions = [],
  action,
}: {
  propertyId: string;
  currentTenant?: { id: string; name: string } | null;
  tenantOptions?: TenantOption[];
  action: (
    propertyId: string,
    docs: ImportMeta[]
  ) => Promise<{ inserted: number; skipped: number }>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "selected" | "importing" | "done">("idle");
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [skipped, setSkipped] = useState<SkipItem[]>([]);
  const [subfolders, setSubfolders] = useState<{ name: string; count: number }[]>([]);
  const [rootCount, setRootCount] = useState(0);
  const [mapping, setMapping] = useState<Record<string, Mapping>>({});
  const [showSkipped, setShowSkipped] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // webkitdirectory não é atributo tipado no React — seta imperativo no ref.
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.setAttribute("webkitdirectory", "");
      inputRef.current.setAttribute("directory", "");
    }
  }, []);

  function reset() {
    setPhase("idle");
    setFiles([]);
    setSkipped([]);
    setSubfolders([]);
    setRootCount(0);
    setMapping({});
    setProgress({ done: 0, total: 0 });
    setErrors([]);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const all = Array.from(e.target.files ?? []);
    if (all.length === 0) return;
    const included: ParsedFile[] = [];
    const skippedList: SkipItem[] = [];
    for (const f of all) {
      const rel0 = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const segs = rel0.split("/");
      segs.shift(); // drop the picked folder's own name
      const name = segs[segs.length - 1] || f.name;
      const mids = segs.slice(0, -1);
      const sub = mids.length > 0 ? mids[0] : "";
      const rel = segs.join("/") || f.name;
      const ext = (name.split(".").pop() || "").toLowerCase();
      let reason = "";
      if (name === ".DS_Store") reason = "system file";
      else if (mids.includes("Photos")) reason = "in a Photos folder";
      else if (SKIP_EXT.has(ext)) reason = `photo/video/other (.${ext})`;
      else if (isTemplateName(name)) reason = "blank template / logo";
      if (reason) {
        skippedList.push({ name: rel, reason });
        continue;
      }
      const docDate = new Date(f.lastModified).toISOString().slice(0, 10);
      included.push({ file: f, name, subfolder: sub, rel, docDate });
    }

    const subCounts = new Map<string, number>();
    let root = 0;
    for (const p of included) {
      if (p.subfolder) subCounts.set(p.subfolder, (subCounts.get(p.subfolder) ?? 0) + 1);
      else root++;
    }
    const subs = Array.from(subCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const map: Record<string, Mapping> = {};
    for (const s of subs) map[s.name] = defaultMapping(s.name, currentTenant, tenantOptions);

    setFiles(included);
    setSkipped(skippedList);
    setSubfolders(subs);
    setRootCount(root);
    setMapping(map);
    setError(null);
    setPhase("selected");
  }

  function setMap(sub: string, patch: Partial<Mapping>) {
    setMapping((m) => ({ ...m, [sub]: { ...m[sub], ...patch } }));
  }

  async function runImport() {
    // Validate: any "past → existing client" must have a client chosen.
    for (const s of subfolders) {
      const m = mapping[s.name];
      if (m.belongs === "past" && m.pastMode === "existing" && !m.tenantId) {
        setError(`Pick a client for "${s.name}", or switch it to a typed name.`);
        return;
      }
    }
    setError(null);
    setPhase("importing");
    setProgress({ done: 0, total: files.length });
    const supabase = createClient();
    const meta: ImportMeta[] = [];
    const errs: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const pf = files[i];
      const path = `property/${propertyId}/${crypto.randomUUID()}-${safeName(pf.name)}`;
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(path, pf.file, {
          upsert: false,
          contentType: pf.file.type || "application/octet-stream",
        });
      if (upErr) {
        errs.push(`${pf.name}: ${upErr.message}`);
        setProgress({ done: i + 1, total: files.length });
        continue;
      }
      let belongs_to: ImportMeta["belongs_to"] = "property";
      let tenant_id: string | null = null;
      let tenant_label: string | null = null;
      if (pf.subfolder) {
        const m = mapping[pf.subfolder];
        if (m.belongs === "current") {
          belongs_to = "current";
        } else if (m.belongs === "past") {
          if (m.pastMode === "existing") {
            belongs_to = "past_existing";
            tenant_id = m.tenantId || null;
          } else {
            belongs_to = "past_free";
            tenant_label = (m.label || pf.subfolder).trim();
          }
        }
      }
      meta.push({
        file_url: path,
        file_name: pf.name,
        content_type: pf.file.type || null,
        doc_date: pf.docDate,
        source_path: pf.rel,
        belongs_to,
        tenant_id,
        tenant_label,
      });
      setProgress({ done: i + 1, total: files.length });
    }

    let res = { inserted: 0, skipped: 0 };
    if (meta.length > 0) {
      try {
        res = await action(propertyId, meta);
      } catch (err) {
        errs.push(`Saving records: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    setErrors(errs);
    setResult(res);
    setPhase("done");
  }

  // ---------- render ----------
  if (phase === "idle") {
    return (
      <div>
        <input ref={inputRef} type="file" multiple onChange={onSelect} className="hidden" />
        <button onClick={() => inputRef.current?.click()} className={buttonClass("ghost")}>
          <FolderUp className="h-4 w-4" /> Import from folder
        </button>
      </div>
    );
  }

  if (phase === "importing") {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="glass space-y-3 p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Loader2 className="h-4 w-4 animate-spin" /> Importing… {progress.done} / {progress.total}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-ink/45">Uploading each file to the property. Please keep this tab open.</p>
      </div>
    );
  }

  if (phase === "done" && result) {
    return (
      <div className="glass space-y-3 p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Check className="h-4 w-4 text-primary" /> Imported {result.inserted} document
          {result.inserted === 1 ? "" : "s"}
          {result.skipped > 0 ? ` · ${result.skipped} already there (skipped)` : ""}
        </div>
        {errors.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> {errors.length} file(s) had an issue:
            </p>
            <ul className="list-disc pl-5 text-xs text-amber-700">
              {errors.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <button onClick={reset} className={buttonClass("primary")}>
          Done
        </button>
      </div>
    );
  }

  // phase === "selected"
  return (
    <div className="glass space-y-5 p-6">
      <div className="flex items-center justify-between">
        <h3 className="h-display text-base text-ink">Import from folder</h3>
        <span className="text-xs text-ink/45">
          {files.length} to import · {skipped.length} skipped
        </span>
      </div>

      {rootCount > 0 && (
        <div className="rounded-xl border border-black/[0.08] bg-black/[0.015] p-3.5 text-sm text-ink/80">
          <span className="font-semibold">{rootCount}</span> file{rootCount === 1 ? "" : "s"} in the
          folder root → attached to <span className="font-semibold">the property</span>.
        </div>
      )}

      {subfolders.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/45">
            Tenant folders — confirm where each goes
          </p>
          {subfolders.map((s) => {
            const m = mapping[s.name];
            return (
              <div key={s.name} className="rounded-xl border border-black/[0.08] bg-white p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-ink">{s.name}</span>
                  <span className="shrink-0 text-xs text-ink/45">{s.count} file{s.count === 1 ? "" : "s"}</span>
                </div>
                <select
                  value={m.belongs}
                  onChange={(e) => setMap(s.name, { belongs: e.target.value as Mapping["belongs"] })}
                  className={inputClass}
                >
                  <option value="property">The property</option>
                  {currentTenant && <option value="current">Current tenant — {currentTenant.name}</option>}
                  <option value="past">A past tenant</option>
                </select>
                {m.belongs === "past" && (
                  <div className="mt-3 space-y-3 rounded-lg border border-black/[0.08] bg-black/[0.015] p-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setMap(s.name, { pastMode: "existing" })}
                        className={
                          (m.pastMode === "existing" ? buttonClass("primary") : buttonClass("ghost")) +
                          " !py-1 !text-xs"
                        }
                      >
                        Existing client
                      </button>
                      <button
                        type="button"
                        onClick={() => setMap(s.name, { pastMode: "free" })}
                        className={
                          (m.pastMode === "free" ? buttonClass("primary") : buttonClass("ghost")) +
                          " !py-1 !text-xs"
                        }
                      >
                        Typed name
                      </button>
                    </div>
                    {m.pastMode === "existing" ? (
                      <Field label="Past tenant" hint="Active and archived clients.">
                        <select
                          value={m.tenantId}
                          onChange={(e) => setMap(s.name, { tenantId: e.target.value })}
                          className={inputClass}
                        >
                          <option value="">Select a client…</option>
                          {tenantOptions.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                              {t.archived ? " (archived)" : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : (
                      <Field label="Name" hint="Past tenant's name (not a client).">
                        <input
                          value={m.label}
                          onChange={(e) => setMap(s.name, { label: e.target.value })}
                          className={inputClass}
                          placeholder="e.g. John Smith"
                        />
                      </Field>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {skipped.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowSkipped((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink/55 hover:text-ink"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition ${showSkipped ? "rotate-180" : ""}`} />
            {skipped.length} skipped (photos, videos, templates)
          </button>
          {showSkipped && (
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-black/[0.06] bg-black/[0.015] p-3 text-xs text-ink/55">
              {skipped.map((s, i) => (
                <li key={i} className="truncate">
                  {s.name} — <span className="text-ink/40">{s.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button onClick={runImport} disabled={files.length === 0} className={buttonClass("primary")}>
          <FolderUp className="h-4 w-4" /> Import {files.length} file{files.length === 1 ? "" : "s"}
        </button>
        <button onClick={reset} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </div>
  );
}
