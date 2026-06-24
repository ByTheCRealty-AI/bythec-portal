"use client";

import { useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { Plus } from "lucide-react";
import { REQUEST_STATUS_LABEL } from "@/lib/types";

type ProviderOption = { id: string; name: string };

// Form inline pra registrar um serviço direto da aba Services do detalhe da
// propriedade. property_id vai em hidden. Date default hoje; status default
// 'open'; price e provider opcionais. Mesmo padrão toggle/glass das outras.
export function ServiceAddForm({
  propertyId,
  providers,
  action,
  today,
}: {
  propertyId: string;
  providers: ProviderOption[];
  action: (fd: FormData) => void | Promise<void>;
  today: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={buttonClass("primary")}>
        <Plus className="h-4 w-4" /> Add service
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
      <div className="flex items-center justify-between">
        <h3 className="h-display text-base text-ink">New service</h3>
        <span className="text-xs text-ink/45">Recorded for this property</span>
      </div>

      <Field label="Description *">
        <textarea
          name="description"
          required
          rows={2}
          className={inputClass}
          placeholder="What was done (e.g. HVAC tune-up, gutter cleaning)…"
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Service date">
          <input name="service_request_date" type="date" defaultValue={today} className={inputClass} />
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
        <Field label="Price (USD)">
          <input name="price" type="number" step="0.01" min={0} className={inputClass} placeholder="250.00" />
        </Field>
        <Field label="Provider" hint="Optional. Active providers only.">
          <select name="provider_id" defaultValue="" className={inputClass}>
            <option value="">— None —</option>
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
          Add service
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
