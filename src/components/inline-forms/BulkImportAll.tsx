"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputClass, buttonClass } from "@/components/ui";
import { FolderUp, Loader2, Check, AlertTriangle } from "lucide-react";

// Import de TODOS os documentos de uma vez: Andrea escolhe a pasta raiz "Property
// Manager" UMA vez; o tool acha as pastas de propriedade (filhas de Year Round /
// Winter Rentals / Seasonal), auto-casa cada uma com uma propriedade do portal
// (ela confirma no dropdown), e importa tudo — propriedade por propriedade, com
// progresso. Upload é CLIENT-SIDE (sessão dela). Idempotente: pula arquivos cujo
// source_path já existe na propriedade escolhida (então NÃO re-sobe o que já veio,
// ex. o piloto do 15 Oak Neck). Mapeamento de inquilino é automático (nome→client,
// current vs past pela propriedade); ajustes finos ficam pro botão "Tenant" por doc.

type PropOption = {
  id: string;
  address: string | null;
  address2: string | null;
  archived: boolean;
  tenant: { id: string; name: string } | null;
};
type ClientOption = { id: string; name: string; archived: boolean };

const CATEGORIES = new Set(["Year Round", "Winter Rentals", "Seasonal"]);
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
  const c = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^[._-]+/, "");
  return c || "file";
}
function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[()]/g, " ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((t) => t && !["uploaded", "the", "and", "documents"].includes(t));
}
function cleanLabel(sub: string): string {
  return sub.replace(/^uploaded\s*\(/i, "").replace(/\)\s*$/, "").trim() || sub;
}
// Address normalization for fuzzy folder→property matching.
function addrTokens(s: string): string[] {
  return s.toLowerCase()
    .replace(/,/g, " ")
    .replace(/#/g, " ")
    .replace(/\b(apt|apartment|unit|no|number|street|st|road|rd|avenue|ave|drive|dr|lane|ln|way|court|ct|hyannis|ma|usa|basement)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/).filter(Boolean);
}
function matchScore(folderName: string, p: PropOption): number {
  const f = new Set(addrTokens(folderName));
  const pt = new Set(addrTokens(`${p.address ?? ""} ${p.address2 ?? ""}`));
  if (f.size === 0 || pt.size === 0) return 0;
  let common = 0;
  for (const t of f) if (pt.has(t)) common++;
  // Require the street number (first numeric token) to match for any real score.
  const fNum = [...f].find((t) => /^\d+$/.test(t));
  const pHasNum = fNum ? pt.has(fNum) : false;
  if (fNum && !pHasNum) return 0;
  return common / f.size;
}

type ParsedFile = {
  file: File;
  filename: string;
  tenantSub: string;
  sourcePath: string; // relative to the property folder (matches per-property tool)
  docDate: string;
};
type FolderGroup = {
  key: string;
  category: string;
  folderName: string;
  files: ParsedFile[];
  matchedId: string; // "" = choose / skip
};
type ImportMeta = {
  file_url: string; file_name: string; content_type: string | null;
  doc_date: string | null; source_path: string;
  belongs_to: "property" | "current" | "past_existing" | "past_free";
  tenant_id: string | null; tenant_label: string | null;
};

export function BulkImportAll({
  properties,
  clients,
  existingByProperty,
  action,
}: {
  properties: PropOption[];
  clients: ClientOption[];
  existingByProperty: Record<string, string[]>; // property_id -> source_paths already imported
  action: (propertyId: string, docs: ImportMeta[]) => Promise<{ inserted: number; skipped: number }>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "review" | "importing" | "done">("idle");
  const [groups, setGroups] = useState<FolderGroup[]>([]);
  const [skippedOther, setSkippedOther] = useState(0);
  const [skippedFiles, setSkippedFiles] = useState(0);
  const [progress, setProgress] = useState({ folder: 0, folders: 0, file: 0, files: 0, name: "" });
  const [totals, setTotals] = useState({ inserted: 0, skipped: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.setAttribute("webkitdirectory", "");
      inputRef.current.setAttribute("directory", "");
    }
  }, []);

  const propSorted = [...properties].sort((a, b) => (a.address ?? "").localeCompare(b.address ?? ""));
  const propById = new Map(properties.map((p) => [p.id, p] as const));
  const propLabel = (p: PropOption) =>
    `${p.address ?? "—"}${p.address2 ? ` · ${p.address2}` : ""}${p.archived ? " (archived)" : ""}`;

  function reset() {
    setPhase("idle");
    setGroups([]);
    setSkippedOther(0);
    setSkippedFiles(0);
    setErrors([]);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const all = Array.from(e.target.files ?? []);
    if (all.length === 0) return;
    const map = new Map<string, FolderGroup>();
    let other = 0;
    let skipped = 0;
    for (const f of all) {
      const rel0 = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const segs = rel0.split("/");
      segs.shift(); // drop the picked root ("Property Manager")
      const category = segs[0] ?? "";
      if (!CATEGORIES.has(category)) { other++; continue; }
      const folderName = segs[1] ?? "";
      if (!folderName || segs.length < 3) { other++; continue; }
      const rest = segs.slice(2); // [tenantSub?, ..., filename]
      const filename = rest[rest.length - 1];
      const mids = rest.slice(0, -1);
      const tenantSub = mids.length > 0 ? mids[0] : "";
      const sourcePath = rest.join("/");
      const ext = (filename.split(".").pop() || "").toLowerCase();
      if (filename === ".DS_Store" || mids.includes("Photos") || SKIP_EXT.has(ext) || isTemplateName(filename)) {
        skipped++; continue;
      }
      const docDate = new Date(f.lastModified).toISOString().slice(0, 10);
      const key = `${category}/${folderName}`;
      const g = map.get(key) ?? { key, category, folderName, files: [], matchedId: "" };
      g.files.push({ file: f, filename, tenantSub, sourcePath, docDate });
      map.set(key, g);
    }
    // Auto-match each folder to a property (only if confident: score >= 0.6).
    const list = Array.from(map.values()).sort((a, b) => a.folderName.localeCompare(b.folderName));
    for (const g of list) {
      let best = ""; let bestScore = 0;
      for (const p of properties) {
        const s = matchScore(g.folderName, p);
        if (s > bestScore) { bestScore = s; best = p.id; }
      }
      g.matchedId = bestScore >= 0.6 ? best : "";
    }
    setGroups(list);
    setSkippedOther(other);
    setSkippedFiles(skipped);
    setError(null);
    setPhase("review");
  }

  function setMatch(key: string, propertyId: string) {
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, matchedId: propertyId } : g)));
  }

  // Resolve one file's belongs_to given the matched property.
  function resolveTenant(pf: ParsedFile, prop: PropOption): Pick<ImportMeta, "belongs_to" | "tenant_id" | "tenant_label"> {
    if (!pf.tenantSub) return { belongs_to: "property", tenant_id: null, tenant_label: null };
    const subTok = tokens(pf.tenantSub);
    const match = subTok.length > 0
      ? clients.find((c) => { const ct = tokens(c.name); return subTok.every((x) => ct.includes(x)); })
      : undefined;
    if (match && prop.tenant && match.id === prop.tenant.id) return { belongs_to: "current", tenant_id: null, tenant_label: null };
    if (match) return { belongs_to: "past_existing", tenant_id: match.id, tenant_label: null };
    return { belongs_to: "past_free", tenant_id: null, tenant_label: cleanLabel(pf.tenantSub) };
  }

  async function runImport() {
    const chosen = groups.filter((g) => g.matchedId);
    if (chosen.length === 0) { setError("Match at least one folder to a property."); return; }
    setError(null);
    setPhase("importing");
    const supabase = createClient();
    const totalFiles = chosen.reduce((n, g) => n + g.files.length, 0);
    let doneFiles = 0;
    let inserted = 0; let skippedTotal = 0;
    const errs: string[] = [];

    for (let gi = 0; gi < chosen.length; gi++) {
      const g = chosen[gi];
      const prop = propById.get(g.matchedId)!;
      const already = new Set(existingByProperty[prop.id] ?? []);
      const meta: ImportMeta[] = [];
      setProgress({ folder: gi + 1, folders: chosen.length, file: 0, files: g.files.length, name: g.folderName });
      for (let fi = 0; fi < g.files.length; fi++) {
        const pf = g.files[fi];
        doneFiles++;
        setProgress({ folder: gi + 1, folders: chosen.length, file: fi + 1, files: g.files.length, name: g.folderName });
        if (already.has(pf.sourcePath)) { skippedTotal++; continue; } // already imported — don't re-upload
        const path = `property/${prop.id}/${crypto.randomUUID()}-${safeName(pf.filename)}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, pf.file, {
          upsert: false, contentType: pf.file.type || "application/octet-stream",
        });
        if (upErr) { errs.push(`${g.folderName}/${pf.filename}: ${upErr.message}`); continue; }
        const t = resolveTenant(pf, prop);
        meta.push({
          file_url: path, file_name: pf.filename, content_type: pf.file.type || null,
          doc_date: pf.docDate, source_path: pf.sourcePath, ...t,
        });
      }
      if (meta.length > 0) {
        try {
          const r = await action(prop.id, meta);
          inserted += r.inserted; skippedTotal += r.skipped;
        } catch (err) {
          errs.push(`${g.folderName}: saving records — ${err instanceof Error ? err.message : "failed"}`);
        }
      }
    }
    void doneFiles; void totalFiles;
    setTotals({ inserted, skipped: skippedTotal });
    setErrors(errs);
    setPhase("done");
  }

  // ---------- render ----------
  if (phase === "idle") {
    return (
      <div className="glass space-y-4 p-6">
        <h3 className="h-display text-base text-ink">Import all property documents</h3>
        <p className="text-sm text-ink/60">
          Pick your <span className="font-semibold">Property Manager</span> folder once. I&apos;ll match each
          property folder to a property here for you to confirm, then import everything. Already‑imported files
          are skipped automatically.
        </p>
        <input ref={inputRef} type="file" multiple onChange={onSelect} className="hidden" />
        <button onClick={() => inputRef.current?.click()} className={buttonClass("primary")}>
          <FolderUp className="h-4 w-4" /> Choose the Property Manager folder
        </button>
      </div>
    );
  }

  if (phase === "importing") {
    const pctFolders = progress.folders ? Math.round((progress.folder / progress.folders) * 100) : 0;
    return (
      <div className="glass space-y-3 p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Loader2 className="h-4 w-4 animate-spin" /> Importing property {progress.folder} / {progress.folders}
        </div>
        <p className="text-sm text-ink/70">{progress.name} — file {progress.file} / {progress.files}</p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pctFolders}%` }} />
        </div>
        <p className="text-xs text-ink/45">Keep this tab open. This can take a while for large folders.</p>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="glass space-y-3 p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Check className="h-4 w-4 text-primary" /> Imported {totals.inserted} document{totals.inserted === 1 ? "" : "s"}
          {totals.skipped > 0 ? ` · ${totals.skipped} already there (skipped)` : ""}
        </div>
        {errors.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> {errors.length} file(s) had an issue:
            </p>
            <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-xs text-amber-700">
              {errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
        <button onClick={reset} className={buttonClass("primary")}>Done</button>
      </div>
    );
  }

  // phase === "review"
  const matchedCount = groups.filter((g) => g.matchedId).length;
  const totalFiles = groups.filter((g) => g.matchedId).reduce((n, g) => n + g.files.length, 0);
  return (
    <div className="glass space-y-5 p-6">
      <div className="flex items-center justify-between">
        <h3 className="h-display text-base text-ink">Confirm folder → property matches</h3>
        <span className="text-xs text-ink/45">
          {matchedCount}/{groups.length} matched · {totalFiles} files · {skippedFiles} skipped
        </span>
      </div>
      <p className="text-xs text-ink/55">
        Each folder is matched to a property below — check them, fix any wrong ones, and set the blank ones.
        Leave a folder blank to skip it. Tenant sorting inside each is automatic (fix any later with the
        Tenant button on a document).
      </p>

      <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {groups.map((g) => (
          <div key={g.key} className="grid grid-cols-1 items-center gap-2 rounded-xl border border-black/[0.08] bg-white p-3 sm:grid-cols-[1fr_1.3fr]">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{g.folderName}</p>
              <p className="text-xs text-ink/45">{g.category} · {g.files.length} file{g.files.length === 1 ? "" : "s"}</p>
            </div>
            <select
              value={g.matchedId}
              onChange={(e) => setMatch(g.key, e.target.value)}
              className={inputClass + (g.matchedId ? "" : " !border-amber-300")}
            >
              <option value="">— skip (no match) —</option>
              {propSorted.map((p) => (
                <option key={p.id} value={p.id}>{propLabel(p)}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {skippedOther > 0 && (
        <p className="text-xs text-ink/45">
          {skippedOther} file(s) outside Year Round / Winter Rentals / Seasonal were ignored (templates, W‑9, etc.).
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-3">
        <button onClick={runImport} disabled={matchedCount === 0} className={buttonClass("primary")}>
          <FolderUp className="h-4 w-4" /> Import {totalFiles} files into {matchedCount} propert{matchedCount === 1 ? "y" : "ies"}
        </button>
        <button onClick={reset} className={buttonClass("ghost")}>Cancel</button>
      </div>
    </div>
  );
}
