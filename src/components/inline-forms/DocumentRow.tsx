"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { date } from "@/lib/format";
import { Field, inputClass, buttonClass } from "@/components/ui";
import {
  FileText,
  FileImage,
  FileSpreadsheet,
  Download,
  Loader2,
  Users,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { DeleteControl, EditButton } from "./InlineRowControls";
import type { Document } from "@/lib/types";

// Linha de documento na aba Documents. O bucket é PRIVADO, então o download gera
// uma signed URL NA HORA do clique (browser client, sessão do usuário → Storage
// RLS aplica) e abre numa nova aba. Nunca persistimos signed URL nem construímos
// URL pública.
//
// PROPERTIES: a row também permite RE-TAGGAR o "belongs to" (property / current
// tenant / past tenant) — usado pra ajustar docs importados que vieram sem tag
// ou mal-arquivados. Só aparece quando canEditTenancy + as props do picker vêm.

type TenantOption = { id: string; name: string; archived: boolean };

function iconFor(contentType: string | null) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("image/")) return <FileImage className="h-4 w-4" />;
  if (ct.includes("spreadsheet") || ct.includes("excel") || ct.includes("csv")) {
    return <FileSpreadsheet className="h-4 w-4" />;
  }
  return <FileText className="h-4 w-4" />;
}

function typeLabel(contentType: string | null): string {
  if (!contentType) return "File";
  const ct = contentType.toLowerCase();
  if (ct === "application/pdf") return "PDF";
  if (ct.startsWith("image/")) return ct.slice(6).toUpperCase();
  const sub = ct.split("/")[1];
  return sub ? sub.toUpperCase() : "File";
}

export function DocumentRow({
  doc,
  canDelete = false,
  deleteAction,
  canEditTenancy = false,
  currentTenant = null,
  tenantOptions = [],
  updateTenancyAction,
  canRename = false,
  renameAction,
}: {
  doc: Document;
  canDelete?: boolean;
  // Recebe a action correta (cliente OU propriedade). Só usada se canDelete.
  deleteAction?: (fd: FormData) => void | Promise<void>;
  // Property-only: re-tag "belongs to". Todos opcionais (client Documents não usa).
  canEditTenancy?: boolean;
  currentTenant?: { id: string; name: string } | null;
  tenantOptions?: TenantOption[];
  updateTenancyAction?: (fd: FormData) => void | Promise<void>;
  // Property-only: renomear o nome exibido. Opcional.
  canRename?: boolean;
  renameAction?: (fd: FormData) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(doc.file_name);
  const [renameErr, setRenameErr] = useState<string | null>(null);
  const [renamePending, startRename] = useTransition();

  function saveRename(e: React.FormEvent) {
    e.preventDefault();
    const name = nameVal.trim();
    if (!name) {
      setRenameErr("The name cannot be empty.");
      return;
    }
    if (!renameAction) return;
    setRenameErr(null);
    const fd = new FormData();
    fd.set("id", doc.id);
    fd.set("parent_id", doc.parent_id);
    fd.set("file_name", name);
    startRename(async () => {
      try {
        await renameAction(fd);
        setRenaming(false);
      } catch (err) {
        setRenameErr(err instanceof Error ? err.message : "Could not rename. Try again.");
      }
    });
  }

  async function download() {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error: sErr } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_url, 60);
      if (sErr || !data?.signedUrl) {
        setError(sErr?.message ?? "Could not generate a download link.");
        setBusy(false);
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  const showTenancyEdit = canEditTenancy && !!updateTenancyAction;
  const dateShown = doc.doc_date ?? doc.created_at;

  return (
    <li className="rounded-xl border border-black/[0.07] bg-black/[0.015] p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            {iconFor(doc.content_type)}
          </span>
          <div className="min-w-0">
            {renaming ? (
              <form onSubmit={saveRename} className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  className={inputClass + " !py-1 !text-sm"}
                />
                <button
                  type="submit"
                  disabled={renamePending}
                  aria-label="Save name"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-60"
                >
                  {renamePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(false);
                    setNameVal(doc.file_name);
                    setRenameErr(null);
                  }}
                  disabled={renamePending}
                  aria-label="Cancel rename"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-black/[0.10] bg-white text-ink/60 hover:bg-black/[0.03] disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-ink">{doc.file_name}</p>
                {canRename && renameAction && (
                  <button
                    type="button"
                    onClick={() => {
                      setNameVal(doc.file_name);
                      setRenaming(true);
                    }}
                    aria-label="Rename document"
                    className="shrink-0 rounded p-1 text-ink/35 transition hover:bg-black/[0.04] hover:text-ink/70"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            <p className="mt-0.5 text-xs text-ink/45">
              {typeLabel(doc.content_type)}
              {doc.year ? ` · ${doc.year}` : ""} · {doc.doc_date ? "Dated" : "Added"}{" "}
              {date(dateShown)}
            </p>
            {renameErr && <p className="mt-1 text-xs text-red-600">{renameErr}</p>}
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={download}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-black/[0.10] bg-white px-3.5 py-2 text-sm text-ink/80 transition-all duration-200 hover:border-black/20 hover:bg-black/[0.03] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download
          </button>
          {showTenancyEdit && (
            <TenancyEditor
              doc={doc}
              currentTenant={currentTenant}
              tenantOptions={tenantOptions}
              action={updateTenancyAction!}
            />
          )}
          {canDelete && deleteAction && (
            <DeleteControl
              action={deleteAction}
              hidden={{ id: doc.id, parent_id: doc.parent_id, file_url: doc.file_url }}
              noun="document"
            />
          )}
        </div>
      </div>
    </li>
  );
}

// Editor inline do "belongs to" de um documento já existente. Abre um paininho na
// própria row com o mesmo seletor do form de add. Submete updateDocumentTenancyAction.
function TenancyEditor({
  doc,
  currentTenant,
  tenantOptions,
  action,
}: {
  doc: Document;
  currentTenant: { id: string; name: string } | null;
  tenantOptions: TenantOption[];
  action: (fd: FormData) => void | Promise<void>;
}) {
  // Estado inicial derivado do estado atual do doc.
  const initialBelongs: "property" | "current" | "past" =
    doc.tenant_id && currentTenant && doc.tenant_id === currentTenant.id
      ? "current"
      : doc.tenant_id || doc.tenant_label
      ? "past"
      : "property";

  const [open, setOpen] = useState(false);
  const [belongs, setBelongs] = useState(initialBelongs);
  const [pastMode, setPastMode] = useState<"existing" | "free">(
    doc.tenant_label ? "free" : "existing"
  );
  const [pastTenantId, setPastTenantId] = useState(
    doc.tenant_id && !(currentTenant && doc.tenant_id === currentTenant.id) ? doc.tenant_id : ""
  );
  const [pastName, setPastName] = useState(doc.tenant_label ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setOpen(false);
    setError(null);
    setBelongs(initialBelongs);
  }

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("id", doc.id);
    fd.set("parent_id", doc.parent_id);
    if (belongs === "current") {
      fd.set("belongs_to", "current");
    } else if (belongs === "past") {
      if (pastMode === "existing") {
        if (!pastTenantId) {
          setError("Pick a past tenant, or switch to entering a name.");
          return;
        }
        fd.set("belongs_to", "past_existing");
        fd.set("tenant_id", pastTenantId);
      } else {
        if (!pastName.trim()) {
          setError("Enter a name, or pick one from the list.");
          return;
        }
        fd.set("belongs_to", "past_free");
        fd.set("tenant_label", pastName.trim());
      }
    } else {
      fd.set("belongs_to", "property");
    }
    start(async () => {
      try {
        await action(fd);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update. Try again.");
      }
    });
  }

  if (!open) {
    return <EditButton onClick={() => setOpen(true)} label="Tenant" />;
  }

  return (
    <div className="w-full max-w-sm space-y-3 rounded-xl border border-black/[0.10] bg-white p-4 shadow-card">
      <div className="flex items-center gap-2 text-xs font-semibold text-ink/70">
        <Users className="h-3.5 w-3.5" /> Belongs to
      </div>
      <select
        value={belongs}
        onChange={(e) => setBelongs(e.target.value as "property" | "current" | "past")}
        className={inputClass}
      >
        <option value="property">The property</option>
        {currentTenant && <option value="current">Current tenant — {currentTenant.name}</option>}
        <option value="past">A past tenant</option>
      </select>

      {belongs === "past" && (
        <div className="space-y-3 rounded-lg border border-black/[0.08] bg-black/[0.015] p-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPastMode("existing")}
              className={
                (pastMode === "existing" ? buttonClass("primary") : buttonClass("ghost")) +
                " !py-1 !text-xs"
              }
            >
              Existing client
            </button>
            <button
              type="button"
              onClick={() => setPastMode("free")}
              className={
                (pastMode === "free" ? buttonClass("primary") : buttonClass("ghost")) +
                " !py-1 !text-xs"
              }
            >
              Enter a name
            </button>
          </div>
          {pastMode === "existing" ? (
            <Field label="Past tenant" hint="Active and archived clients.">
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
            <Field label="Name" hint="Past tenant's name.">
              <input
                value={pastName}
                onChange={(e) => setPastName(e.target.value)}
                className={inputClass}
                placeholder="e.g. John Smith"
              />
            </Field>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className={buttonClass("primary") + " !py-1.5 !text-xs"}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className={buttonClass("ghost") + " !py-1.5 !text-xs"}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
