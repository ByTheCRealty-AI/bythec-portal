"use client";

import { useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { date } from "@/lib/format";
import { REQUEST_STATUS_LABEL } from "@/lib/types";
import { EditButton, DeleteControl } from "./InlineRowControls";
import type { TenantRequest } from "@/lib/types";

function StatusBadge({ status }: { status: "open" | "done" }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
        Done
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-secondary/25 bg-secondary/10 px-2.5 py-0.5 text-xs font-semibold text-secondary">
      Open
    </span>
  );
}

// Linha de tenant request (list item, property-only). Read-only com Edit/Delete
// quando `canEdit`. Em modo edit vira um form inline igual ao RequestAddForm
// (description, date, status). tenant_id não é editável aqui (auto na criação).
export function RequestRow({
  request,
  propertyId,
  canEdit,
  updateAction,
  deleteAction,
}: {
  request: TenantRequest;
  propertyId: string;
  canEdit: boolean;
  updateAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="py-4">
        <form
          action={async (fd) => {
            await updateAction(fd);
            setEditing(false);
          }}
          className="space-y-4 rounded-xl border border-primary/30 bg-primary/[0.03] p-4"
        >
          <input type="hidden" name="id" value={request.id} />
          <input type="hidden" name="property_id" value={propertyId} />

          <Field label="Description *">
            <textarea
              name="description"
              required
              rows={2}
              defaultValue={request.description ?? ""}
              className={inputClass}
              placeholder="What the tenant reported (e.g. leaking faucet)…"
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Date">
              <input
                name="date"
                type="date"
                defaultValue={request.date ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={request.status} className={inputClass}>
                {Object.entries(REQUEST_STATUS_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex gap-3">
            <button type="submit" className={buttonClass("primary")}>
              Save request
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
    <li className="flex items-start justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm text-ink/85">{request.description || "—"}</p>
        <p className="mt-0.5 text-xs text-ink/45">{date(request.date ?? request.created_at)}</p>
        {request.created_by_name && (
          <p className="mt-1 text-[11px] text-ink/40">{request.created_by_name}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={request.status} />
        {canEdit && (
          <>
            <EditButton onClick={() => setEditing(true)} />
            <DeleteControl
              action={deleteAction}
              hidden={{ id: request.id, property_id: propertyId }}
              noun="request"
            />
          </>
        )}
      </div>
    </li>
  );
}
