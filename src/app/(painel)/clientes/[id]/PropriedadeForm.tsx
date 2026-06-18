"use client";

import { useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { PROPERTY_TYPE_LABEL, type PropertyType } from "@/lib/types";
import { createPropriedadeAction } from "../actions";
import { Plus } from "lucide-react";

// Form para pendurar propriedade no cliente. owner_id já vem do cliente (entidade-mãe).
export function PropriedadeForm({
  ownerId,
  ownerName,
  ownerBillingAddress,
}: {
  ownerId: string;
  ownerName: string;
  ownerBillingAddress: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PropertyType | "">("");

  const action = createPropriedadeAction.bind(null, ownerId);
  const isRental = type === "year_round_rental" || type === "off_season_rental";

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={buttonClass("primary")}>
        <Plus className="h-4 w-4" /> Add property
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
      <div className="flex items-center justify-between">
        <h3 className="h-display text-base text-ink">New property</h3>
        <span className="text-xs text-ink/45">Owner: {ownerName} (auto)</span>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Address *" hint="From our records, with unit number — never from Google.">
          <input
            name="address"
            required
            defaultValue={ownerBillingAddress ?? ""}
            className={inputClass}
            placeholder="12 Rainbow Ave, East Falmouth MA 02536"
          />
        </Field>
        <Field label="Unit / apt">
          <input name="address2" className={inputClass} placeholder="Unit 1" />
        </Field>
        <Field label="Type *">
          <select
            name="property_type"
            required
            value={type}
            onChange={(e) => setType(e.target.value as PropertyType)}
            className={inputClass}
          >
            <option value="" disabled>Select…</option>
            {Object.entries(PROPERTY_TYPE_LABEL).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Commission (% / amount per home)" hint="For vacation rentals, the % is confirmed with Andrea.">
          <input name="commission_fee" type="number" step="0.01" className={inputClass} placeholder="12.50" />
        </Field>

        {/* Datas de lease só para aluguel (vacation rental não tem). */}
        {isRental && (
          <>
            <Field label="Monthly rent (USD)">
              <input name="rent_price" type="number" step="0.01" className={inputClass} placeholder="3000.00" />
            </Field>
            <Field label="Rent due day">
              <input name="rent_due_day" type="number" min={1} max={31} defaultValue={1} className={inputClass} />
            </Field>
            <Field label="Lease start">
              <input name="rental_start" type="date" className={inputClass} />
            </Field>
            <Field label="Lease end">
              <input name="rental_end" type="date" className={inputClass} />
            </Field>
            <Field label="Frequency">
              <select name="rent_frequency" className={inputClass} defaultValue="monthly">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </Field>
          </>
        )}
      </div>

      <Field label="Notes">
        <textarea name="notes" rows={2} className={inputClass} />
      </Field>

      <div className="flex gap-3">
        <button type="submit" className={buttonClass("primary")}>Save property</button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>Cancel</button>
      </div>
    </form>
  );
}
