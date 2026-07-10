"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  CheckCircle2,
  Circle,
  Pencil,
  Archive,
  Trash2,
  Loader2,
  BellRing,
  ShieldAlert,
} from "lucide-react";
import { cx, date } from "@/lib/format";
import { ROLE_LABEL, type AppRole } from "@/lib/auth/capabilities";
import { isEscalatedToViewer } from "@/lib/reminders";
import type { ReminderStatus, ReminderParentType } from "@/lib/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ReminderAddForm } from "./ReminderAddForm";
import { EmptyState } from "@/components/ui";

// Diretório mínimo de pessoas (dropdown + resolução de nome/papel).
export type PersonOption = {
  id: string;
  full_name: string | null;
  role: AppRole;
};

// Linha já enriquecida no servidor (nome do responsável + escalação computada).
export type ReminderBoardRow = {
  id: string;
  title: string;
  notes: string | null;
  status: ReminderStatus;
  done_at: string | null;
  due_date: string | null;
  parent_type: ReminderParentType | null;
  parent_id: string | null;
  assigned_to: string;
  assignee_name: string | null;
  created_at: string;
  creator_name: string | null;
  ageDays: number;
  escalatedToManager: boolean;
  escalatedToOwner: boolean;
};

type StatusFilter = "" | "open" | "done";

function initials(name: string | null): string {
  const src = (name || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function StatusPill({ status }: { status: ReminderStatus }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
        Done
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-black/10 bg-black/[0.04] px-2.5 py-0.5 text-xs font-semibold text-ink/60">
      Open
    </span>
  );
}

// Badge de escalação: mostra o nível MAIS ALTO ativo (Owner > Manager).
function EscalationBadge({ row }: { row: ReminderBoardRow }) {
  if (row.escalatedToOwner) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">
        <ShieldAlert className="h-3 w-3" /> Owner
      </span>
    );
  }
  if (row.escalatedToManager) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
        <BellRing className="h-3 w-3" /> Manager
      </span>
    );
  }
  return null;
}

export function RemindersClient({
  rows,
  people,
  viewerRole,
  viewerId,
  canManage,
  isOwner,
  createAction,
  updateAction,
  setStatusAction,
  archiveAction,
  deleteAction,
}: {
  rows: ReminderBoardRow[];
  people: PersonOption[];
  viewerRole: AppRole;
  viewerId: string;
  canManage: boolean;
  isOwner: boolean;
  createAction: (fd: FormData) => Promise<void>;
  updateAction: (fd: FormData) => Promise<void>;
  setStatusAction: (id: string, done: boolean) => Promise<void>;
  archiveAction: (id: string) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const [person, setPerson] = useState<string>("");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReminderBoardRow | null>(null);
  const [, startTransition] = useTransition();

  const term = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      if (person && r.assigned_to !== person) return false;
      if (status && r.status !== status) return false;
      if (
        escalatedOnly &&
        !isEscalatedToViewer(viewerRole, {
          ageDays: r.ageDays,
          escalatedToManager: r.escalatedToManager,
          escalatedToOwner: r.escalatedToOwner,
        })
      ) {
        return false;
      }
      if (term) {
        const hay = `${r.title} ${r.notes ?? ""} ${r.assignee_name ?? ""}`.toLowerCase();
        return term.split(/\s+/).every((w) => hay.includes(w));
      }
      return true;
    });
    // Ordem: abertos primeiro (mais antigo = mais urgente no topo), depois done.
    return list.sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      if (a.status === "open") {
        // mais antigo primeiro (created_at ascendente)
        return a.created_at.localeCompare(b.created_at);
      }
      // done: concluído mais recente primeiro
      return (b.done_at ?? "").localeCompare(a.done_at ?? "");
    });
  }, [rows, person, status, escalatedOnly, term, viewerRole]);

  function toggleStatus(row: ReminderBoardRow) {
    if (!canManage) return;
    setPendingId(row.id);
    startTransition(async () => {
      try {
        await setStatusAction(row.id, row.status !== "done");
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  function archive(row: ReminderBoardRow) {
    if (!canManage) return;
    setPendingId(row.id);
    startTransition(async () => {
      try {
        await archiveAction(row.id);
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  const statusChips: Array<{ value: StatusFilter; label: string }> = [
    { value: "open", label: "Open" },
    { value: "done", label: "Done" },
    { value: "", label: "All" },
  ];

  const escalatable = viewerRole === "owner" || viewerRole === "manager";

  return (
    <>
      {canManage && (
        <ReminderAddForm people={people} action={createAction} />
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {statusChips.map((c) => {
          const active = status === c.value;
          return (
            <button
              key={c.value || "all"}
              onClick={() => setStatus(c.value)}
              className={cx(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-black/10 bg-white text-ink/60 hover:text-ink hover:border-black/20"
              )}
            >
              {c.label}
            </button>
          );
        })}

        {escalatable && (
          <button
            onClick={() => setEscalatedOnly((v) => !v)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
              escalatedOnly
                ? "border-red-300 bg-red-50 text-red-600"
                : "border-black/10 bg-white text-ink/60 hover:text-ink hover:border-black/20"
            )}
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Escalated to me
          </button>
        )}

        <select
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          className="ml-auto rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink/70 outline-none transition focus:border-primary/40"
        >
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name ?? "Unnamed"}
              {p.id === viewerId ? " (me)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, notes or person…"
          className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<BellRing className="h-6 w-6" />}
          title="No reminders yet"
          message="Create a follow-up and assign it to someone. Unfinished ones escalate here automatically."
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-10 text-center text-sm text-ink/55 shadow-card">
          No reminders match the current filter.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const done = r.status === "done";
            const busy = pendingId === r.id;
            if (editingId === r.id) {
              return (
                <li key={r.id}>
                  <ReminderAddForm
                    people={people}
                    action={updateAction}
                    defaults={{
                      id: r.id,
                      title: r.title,
                      notes: r.notes,
                      assigned_to: r.assigned_to,
                      due_date: r.due_date,
                    }}
                    onDone={() => setEditingId(null)}
                  />
                </li>
              );
            }
            return (
              <li
                key={r.id}
                className={cx(
                  "flex items-start gap-3 rounded-2xl border bg-white px-4 py-3.5 shadow-card transition",
                  r.escalatedToOwner
                    ? "border-red-200"
                    : r.escalatedToManager
                    ? "border-violet-200"
                    : "border-black/[0.08]",
                  done && "opacity-60"
                )}
              >
                {/* Check-off */}
                <button
                  onClick={() => toggleStatus(r)}
                  disabled={!canManage || busy}
                  title={done ? "Reopen" : "Mark done"}
                  className={cx(
                    "mt-0.5 shrink-0 transition",
                    done ? "text-primary" : "text-ink/30 hover:text-primary",
                    (!canManage || busy) && "cursor-not-allowed opacity-60"
                  )}
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : done ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cx(
                        "text-sm font-semibold text-ink",
                        done && "line-through decoration-ink/40"
                      )}
                    >
                      {r.title}
                    </span>
                    <StatusPill status={r.status} />
                    {!done && <EscalationBadge row={r} />}
                  </div>

                  {r.notes && (
                    <p className="mt-1 line-clamp-2 text-xs text-ink/55">{r.notes}</p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink/50">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/12 text-[9px] font-bold text-primary">
                        {initials(r.assignee_name)}
                      </span>
                      {r.assignee_name ?? "Unassigned"}
                    </span>
                    {!done && (
                      <span
                        className={cx(
                          r.escalatedToOwner
                            ? "font-semibold text-red-600"
                            : r.escalatedToManager
                            ? "font-semibold text-violet-700"
                            : ""
                        )}
                      >
                        {r.ageDays}d open
                      </span>
                    )}
                    {r.due_date && <span>Due {date(r.due_date)}</span>}
                    {done && r.done_at && <span>Done {date(r.done_at)}</span>}
                    {r.creator_name && <span>by {r.creator_name}</span>}
                  </div>
                </div>

                {/* Ações */}
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setEditingId(r.id)}
                      disabled={busy}
                      title="Edit"
                      className="grid h-8 w-8 place-items-center rounded-lg text-ink/40 transition hover:bg-black/[0.04] hover:text-ink disabled:opacity-50"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => archive(r)}
                      disabled={busy}
                      title="Archive"
                      className="grid h-8 w-8 place-items-center rounded-lg text-ink/40 transition hover:bg-black/[0.04] hover:text-ink disabled:opacity-50"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => setDeleteTarget(r)}
                        disabled={busy}
                        title="Delete permanently"
                        className="grid h-8 w-8 place-items-center rounded-lg text-red-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteAction(deleteTarget.id);
        }}
        title="Delete reminder"
        description={
          <>
            This permanently removes the reminder{" "}
            <strong className="text-ink">{deleteTarget?.title}</strong>. This cannot be undone —
            prefer <em>Archive</em> unless you are sure.
          </>
        }
        confirmPhrase="delete"
      />
    </>
  );
}
