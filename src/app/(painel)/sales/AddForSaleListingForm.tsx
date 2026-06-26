"use client";

// Inline "Add property for sale" form on the Sales · For sale tab. Creates a
// properties row (property_type='for_sale', sale_status='active') — shows up here
// AND in the main Properties list. owner_id = the seller (a client).
import { useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { Plus } from "lucide-react";
import type { Realtor } from "@/lib/types";

export type OwnerOption = { id: string; name: string };

export function AddForSaleListingForm({
  owners,
  realtors,
  action,
}: {
  owners: OwnerOption[];
  realtors: Realtor[];
  action: (fd: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={buttonClass("primary")}>
        <Plus className="h-4 w-4" /> Add property for sale
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
        <h3 className="h-display text-base text-ink">New property for sale</h3>
        <span className="text-xs text-ink/45">Shows up here and in Properties</span>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Seller (owner) *" hint="The client who owns the property.">
          <select name="owner_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select seller…
            </option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Realtor">
          <select name="realtor_id" defaultValue="" className={inputClass}>
            <option value="">Unassigned</option>
            {realtors.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Address *">
          <input name="address" required className={inputClass} placeholder="123 Main St" />
        </Field>
        <Field label="Unit / address line 2">
          <input name="address2" className={inputClass} placeholder="Apt, unit, etc. (optional)" />
        </Field>
        <Field label="Commission ($)" hint="By the C commission for this sale.">
          <input name="commission_fee" type="number" step="0.01" min={0} className={inputClass} placeholder="0.00" />
        </Field>
      </div>

      <Field label="Notes">
        <textarea name="notes" rows={2} className={inputClass} placeholder="Optional notes about the listing." />
      </Field>

      <div className="flex gap-3">
        <button type="submit" className={buttonClass("primary")}>
          Add listing
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
