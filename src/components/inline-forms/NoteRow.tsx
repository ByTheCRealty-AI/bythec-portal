"use client";

import { useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { date } from "@/lib/format";
import { EditButton, DeleteControl } from "./InlineRowControls";
import type { Note } from "@/lib/types";

// Linha de nota na aba Notes (cliente OU propriedade). Read-only por padrão, com
// Edit/Delete só quando `canEdit`. Edit transforma a row num form inline igual
// ao NoteAddForm (mesmos campos). Save/Cancel chamam updateAction; Delete usa o
// confirm leve. parentId vai como parent_id pras actions.
export function NoteRow({
  note,
  parentId,
  canEdit,
  updateAction,
  deleteAction,
}: {
  note: Note;
  parentId: string;
  canEdit: boolean;
  updateAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
        <form
          action={async (fd) => {
            await updateAction(fd);
            setEditing(false);
          }}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={note.id} />
          <input type="hidden" name="parent_id" value={parentId} />

          <Field label="Note *" hint="Internal note. Not shared with the client.">
            <textarea
              name="body"
              required
              rows={3}
              defaultValue={note.body ?? ""}
              className={inputClass}
              placeholder="Write a note…"
            />
          </Field>

          <div className="sm:max-w-[12rem]">
            <Field label="Year" hint="Defaults to the current year.">
              <input
                name="year"
                type="number"
                min={2000}
                max={2100}
                defaultValue={note.year ?? new Date().getFullYear()}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="flex gap-3">
            <button type="submit" className={buttonClass("primary")}>
              Save note
            </button>
            <button type="button" onClick={() => setEditing(false)} className={buttonClass("ghost")}>
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-black/[0.07] bg-black/[0.015] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-xs text-ink/45">
            <span>{date(note.created_at)}</span>
            {note.year && <span className="text-ink/35">· {note.year}</span>}
          </div>
          <p className="whitespace-pre-wrap text-sm text-ink/80">{note.body || "—"}</p>
          {note.created_by_name && (
            <p className="mt-2 text-[11px] text-ink/40">Added by {note.created_by_name}</p>
          )}
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-start gap-2">
            <EditButton onClick={() => setEditing(true)} />
            <DeleteControl
              action={deleteAction}
              hidden={{ id: note.id, parent_id: parentId }}
              noun="note"
            />
          </div>
        )}
      </div>
    </li>
  );
}
