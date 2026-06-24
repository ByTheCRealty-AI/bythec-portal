"use client";

import { useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { Plus } from "lucide-react";
import { REQUEST_STATUS_LABEL } from "@/lib/types";

// Form inline pra abrir uma tenant request direto da aba Requests do detalhe da
// propriedade. property_id (e o tenant_id atual, auto) vão em hidden. Date
// default hoje; status default 'open'. Mesmo padrão toggle/glass das outras.
export function RequestAddForm({
  propertyId,
  tenantId,
  tenantName,
  action,
  today,
}: {
  propertyId: string;
  tenantId: string | null;
  tenantName: string | null;
  action: (fd: FormData) => void | Promise<void>;
  today: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={buttonClass("primary")}>
        <Plus className="h-4 w-4" /> Add request
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await action(fd);
        setOpen(false);
      }}
      className="glass space-y-5 p-6"
    >
      <input type="hidden" name="property_id" value={propertyId} />
      {tenantId && <input type="hidden" name="tenant_id" value={tenantId} />}
      <div className="flex items-center justify-between">
        <h3 className="h-display text-base text-ink">New request</h3>
        <span className="text-xs text-ink/45">
          {tenantName ? `Tenant: ${tenantName} (auto)` : "No current tenant"}
        </span>
      </div>

      <Field label="Description *">
        <textarea
          name="description"
          required
          rows={2}
          className={inputClass}
          placeholder="What the tenant reported (e.g. leaking faucet)…"
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Date">
          <input name="date" type="date" defaultValue={today} className={inputClass} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue="open" className={inputClass}>
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
          Add request
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
