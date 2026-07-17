"use client";

import { useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { money, date } from "@/lib/format";
import { REQUEST_STATUS_LABEL } from "@/lib/types";
import { EditButton, DeleteControl } from "./InlineRowControls";
import type { Service } from "@/lib/types";

type ProviderOption = { id: string; name: string };

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

// Linha de serviço (table row, property-only). Read-only com Edit/Delete quando
// `canEdit`. Em modo edit, a row vira UMA célula colspan com um form igual ao
// ServiceAddForm (mesmos campos). today é só o fallback de data ao salvar vazio.
export function ServiceRow({
  service,
  propertyId,
  providers,
  canEdit,
  zebra,
  updateAction,
  deleteAction,
}: {
  service: Service;
  propertyId: string;
  providers: ProviderOption[];
  canEdit: boolean;
  zebra: boolean;
  updateAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <tr className="border-t border-black/[0.05] bg-primary/[0.03]">
        <td colSpan={canEdit ? 6 : 5} className="px-4 py-4">
          <form
            action={async (fd) => {
              await updateAction(fd);
              setEditing(false);
            }}
            className="space-y-4"
          >
            <input type="hidden" name="id" value={service.id} />
            <input type="hidden" name="property_id" value={propertyId} />

            <Field label="Description *">
              <textarea
                name="description"
                required
                rows={2}
                defaultValue={service.description ?? ""}
                className={inputClass}
                placeholder="What was done (e.g. HVAC tune-up, gutter cleaning)…"
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Service date">
                <input
                  name="service_request_date"
                  type="date"
                  defaultValue={service.service_request_date ?? ""}
                  className={inputClass}
                />
              </Field>
              <Field label="Status">
                <select name="status" defaultValue={service.status} className={inputClass}>
                  {Object.entries(REQUEST_STATUS_LABEL).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Price (USD)">
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={service.price ?? ""}
                  className={inputClass}
                  placeholder="250.00"
                />
              </Field>
              <Field label="Provider" hint="Optional. Active providers only.">
                <select
                  name="provider_id"
                  defaultValue={service.provider?.id ?? ""}
                  className={inputClass}
                >
                  <option value="">— None —</option>
                  {/* Garante que o provider atual aparece mesmo se arquivado. */}
                  {service.provider && !providers.some((p) => p.id === service.provider!.id) && (
                    <option value={service.provider.id}>{service.provider.name}</option>
                  )}
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="flex gap-3">
              <button type="submit" className={buttonClass("primary")}>
                Save service
              </button>
              <button type="button" onClick={() => setEditing(false)} className={buttonClass("ghost")}>
                Cancel
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className={"border-t border-black/[0.05] " + (zebra ? "bg-black/[0.015]" : "")}>
      <td className="whitespace-nowrap px-4 py-3 text-ink/65">
        {date(service.service_request_date ?? service.created_at)}
      </td>
      <td className="px-4 py-3 text-ink/85">
        {service.description || "—"}
        {service.created_by_name && (
          <span className="mt-0.5 block text-[11px] text-ink/40">{service.created_by_name}</span>
        )}
      </td>
      <td className="px-4 py-3 text-ink/65">{service.provider?.name ?? "—"}</td>
      <td className="px-4 py-3 text-right text-ink/85">{money(service.price)}</td>
      <td className="px-4 py-3">
        <StatusBadge status={service.status} />
      </td>
      {canEdit && (
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <EditButton onClick={() => setEditing(true)} />
            <DeleteControl
              action={deleteAction}
              hidden={{ id: service.id, property_id: propertyId }}
              noun="service"
            />
          </div>
        </td>
      )}
    </tr>
  );
}
