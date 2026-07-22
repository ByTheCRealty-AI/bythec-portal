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
//
// PROPERTIES ONLY: quando parentType === "property", mostramos o seletor
// "Belongs to" (a própria propriedade / inquilino atual / inquilino passado).
// Pra clientes o form fica exatamente como era.

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

type TenantOption = { id: string; name: string; archived: boolean };

export function DocumentAddForm({
  parentType,
  parentId,
  action,
  currentTenant = null,
  tenantOptions = [],
  hideTenantOptions = false,
}: {
  parentType: "client" | "property";
  parentId: string;
  action: (fd: FormData) => void | Promise<void>;
  // Property-only "belongs to" inputs. Ignored for clients.
  currentTenant?: { id: string; name: string } | null;
  tenantOptions?: TenantOption[];
  // For Sale properties têm nada de inquilino: esconde o seletor "Belongs to" e
  // o doc é sempre atribuído à propriedade (property-level).
  hideTenantOptions?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentYear = new Date().getFullYear();
  const target = parentType === "client" ? "client" : "property";
  const showBelongsTo = parentType === "property" && !hideTenantOptions;

  // "Belongs to" state (property only). UI-level "belongs" is resolved to the
  // server enum on submit. Past tenant can be an existing client OR a free name.
  const [belongs, setBelongs] = useState<"property" | "current" | "past">("property");
  const [pastMode, setPastMode] = useState<"existing" | "free">(
    tenantOptions.length > 0 ? "existing" : "free"
  );
  const [pastTenantId, setPastTenantId] = useState<string>("");
  const [pastName, setPastName] = useState<string>("");
  const [pastYears, setPastYears] = useState<string>("");

  function reset() {
    setError(null);
    setBusy(false);
    setOpen(false);
    setBelongs("property");
    setPastMode(tenantOptions.length > 0 ? "existing" : "free");
    setPastTenantId("");
    setPastName("");
    setPastYears("");
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

    // Resolve the "belongs to" choice into the server enum + validate locally
    // (the server re-validates and looks up the current tenant itself).
    let belongsTo = "property";
    if (showBelongsTo) {
      if (belongs === "current") {
        belongsTo = "current";
      } else if (belongs === "past") {
        if (pastMode === "existing") {
          if (!pastTenantId) {
            setError("Pick a past tenant, or switch to entering a name.");
            return;
          }
          belongsTo = "past_existing";
        } else {
          if (!pastName.trim()) {
            setError("Enter the past tenant's name, or pick one from the list.");
            return;
          }
          belongsTo = "past_free";
        }
      }
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
      if (showBelongsTo) {
        fd.set("belongs_to", belongsTo);
        if (belongsTo === "past_existing") fd.set("tenant_id", pastTenantId);
        if (belongsTo === "past_free") {
          fd.set("tenant_label", pastName.trim());
          if (pastYears.trim()) fd.set("tenant_years", pastYears.trim());
        }
      }

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

      {showBelongsTo && (
        <Field label="Belongs to" hint="Organize this file under the property or a tenant.">
          <select
            value={belongs}
            onChange={(e) => setBelongs(e.target.value as "property" | "current" | "past")}
            className={inputClass}
          >
            <option value="property">The property</option>
            {currentTenant && <option value="current">Current tenant — {currentTenant.name}</option>}
            <option value="past">A past tenant</option>
          </select>
        </Field>
      )}

      {showBelongsTo && belongs === "past" && (
        <div className="space-y-4 rounded-xl border border-black/[0.08] bg-black/[0.015] p-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPastMode("existing")}
              className={
                pastMode === "existing"
                  ? buttonClass("primary") + " !py-1.5 !text-xs"
                  : buttonClass("ghost") + " !py-1.5 !text-xs"
              }
            >
              Existing client
            </button>
            <button
              type="button"
              onClick={() => setPastMode("free")}
              className={
                pastMode === "free"
                  ? buttonClass("primary") + " !py-1.5 !text-xs"
                  : buttonClass("ghost") + " !py-1.5 !text-xs"
              }
            >
              Enter a name
            </button>
          </div>

          {pastMode === "existing" ? (
            <Field label="Past tenant" hint="Searches active and archived clients.">
              <select
                value={pastTenantId}
                onChange={(e) => setPastTenantId(e.target.value)}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name *" hint="The past tenant's name.">
                <input
                  value={pastName}
                  onChange={(e) => setPastName(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. John Smith"
                />
              </Field>
              <Field label="Years" hint="Optional, e.g. 2021–2022.">
                <input
                  value={pastYears}
                  onChange={(e) => setPastYears(e.target.value)}
                  className={inputClass}
                  placeholder="2021–2022"
                />
              </Field>
            </div>
          )}
        </div>
      )}

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
