"use client";

// Lista de documentos com REORDENAÇÃO manual (owner/manager). Em modo normal,
// renderiza os DocumentRow na ordem que vier. No modo "Reorder", vira uma lista
// enxuta (grip + nº + nome) que dá pra ARRASTAR ou usar as setas ↑/↓; ao salvar,
// grava sort_order via reorderAction. As setas cobrem touch (iPad); o drag é o
// atalho rápido no computador. Gate de permissão fica no server (reorderAction).
import { useRef, useState, useTransition } from "react";
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  ListOrdered,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { buttonClass } from "@/components/ui";
import { DocumentRow } from "./DocumentRow";
import type { Document } from "@/lib/types";

type TenantOption = { id: string; name: string; archived: boolean };
export type DocumentRowProps = {
  canDelete: boolean;
  deleteAction: (fd: FormData) => void | Promise<void>;
  canEditTenancy: boolean;
  currentTenant: { id: string; name: string } | null;
  tenantOptions: TenantOption[];
  updateTenancyAction: (fd: FormData) => void | Promise<void>;
  canRename: boolean;
  renameAction: (fd: FormData) => void | Promise<void>;
};

export function SortableDocumentList({
  docs,
  propertyId,
  canReorder,
  reorderAction,
  rowProps,
}: {
  docs: Document[];
  propertyId: string;
  canReorder: boolean;
  reorderAction: (propertyId: string, orderedIds: string[]) => Promise<void>;
  rowProps: DocumentRowProps;
}) {
  const [mode, setMode] = useState(false);
  const [order, setOrder] = useState<Document[]>(docs);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);

  function begin() {
    setOrder(docs);
    setErr(null);
    setMode(true);
  }
  function cancel() {
    setOrder(docs);
    setErr(null);
    setMode(false);
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    setOrder((prev) => {
      const a = [...prev];
      const [x] = a.splice(from, 1);
      a.splice(to, 0, x);
      return a;
    });
  }
  function onDrop(to: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === to) return;
    move(from, to);
  }
  function save() {
    setErr(null);
    start(async () => {
      try {
        await reorderAction(propertyId, order.map((d) => d.id));
        setMode(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not save the order. Try again.");
      }
    });
  }

  if (!mode) {
    return (
      <div className="space-y-3">
        {canReorder && docs.length > 1 && (
          <div className="flex justify-end">
            <button onClick={begin} className={buttonClass("ghost") + " !py-1.5 !text-xs"}>
              <ListOrdered className="h-3.5 w-3.5" /> Reorder
            </button>
          </div>
        )}
        <ul className="space-y-3">
          {docs.map((d) => (
            <DocumentRow key={d.id} doc={d} {...rowProps} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/[0.03] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink/70">
          Drag, or use ↑ ↓, to set the order — then Save.
        </span>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={pending}
            className={buttonClass("primary") + " !py-1.5 !text-xs"}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save order
          </button>
          <button
            onClick={cancel}
            disabled={pending}
            className={buttonClass("ghost") + " !py-1.5 !text-xs"}
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        </div>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <ul className="space-y-2">
        {order.map((d, i) => (
          <li
            key={d.id}
            draggable
            onDragStart={() => {
              dragIndex.current = i;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(i)}
            className="flex items-center gap-2 rounded-lg border border-black/[0.10] bg-white px-3 py-2"
          >
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-ink/30" />
            <span className="w-5 shrink-0 text-center text-xs text-ink/40">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink/80">{d.file_name}</span>
            {d.doc_date && (
              <span className="hidden shrink-0 text-[11px] text-ink/35 sm:inline">{d.doc_date}</span>
            )}
            <button
              type="button"
              onClick={() => move(i, i - 1)}
              disabled={i === 0}
              aria-label="Move up"
              className="grid h-7 w-7 shrink-0 place-items-center rounded border border-black/[0.10] text-ink/50 hover:bg-black/[0.03] disabled:opacity-30"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => move(i, i + 1)}
              disabled={i === order.length - 1}
              aria-label="Move down"
              className="grid h-7 w-7 shrink-0 place-items-center rounded border border-black/[0.10] text-ink/50 hover:bg-black/[0.03] disabled:opacity-30"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
