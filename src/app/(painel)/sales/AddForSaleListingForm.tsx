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
  // Preço × % → $ (mesma conta do SaleFields da propriedade). O $ é o que vale;
  // a Andrea pode sobrescrever.
  const [price, setPrice] = useState("");
  const [rate, setRate] = useState("");
  const [amount, setAmount] = useState("");

  function recompute(nextPrice: string, nextRate: string) {
    const pr = parseFloat(nextPrice);
    const r = parseFloat(nextRate);
    if (Number.isFinite(pr) && Number.isFinite(r)) {
      setAmount((Math.round(pr * r) / 100).toFixed(2));
    }
  }

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
        <Field label="Sale price (USD)" hint="What the house is being sold for.">
          <input
            name="sale_price"
            type="number"
            step="0.01"
            min={0}
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              recompute(e.target.value, rate);
            }}
            className={inputClass}
            placeholder="650000"
          />
        </Field>
        <Field label="My commission %" hint="Optional — fills in the amount from the price.">
          <input
            name="sale_commission_rate"
            type="number"
            step="0.01"
            min={0}
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              recompute(price, e.target.value);
            }}
            className={inputClass}
            placeholder="2.5"
          />
        </Field>
        <Field label="My commission (USD)" hint="Auto-filled from the %. You can override it.">
          <input
            name="sale_commission"
            type="number"
            step="0.01"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
            placeholder="16250"
          />
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
