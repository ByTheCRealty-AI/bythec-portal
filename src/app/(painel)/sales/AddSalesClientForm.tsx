"use client";

import { useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { PhoneInput, AddressFields } from "@/components/form-fields";
import { Plus } from "lucide-react";
import {
  DEAL_SIDE_LABEL,
  BUYER_STAGE_LABEL,
  SELLER_STAGE_LABEL,
  type DealSide,
  type Realtor,
} from "@/lib/types";

// Reaproveita as colunas billing_* do cliente (não há colunas separadas). No
// contexto de Sales rotulamos a seção só "Address" — buyer/seller não é faturado.
const ADDRESS_NAMES = {
  line1: "billing_address",
  line2: "billing_address2",
  city: "billing_city",
  state: "billing_state",
  zip: "billing_zip",
} as const;

// Inline "Add buyer/seller" form on the Sales screen. Creates a buy/sell client
// (client_type='buy_sell_client') with side + realtor + stage. The stage options
// swap based on the chosen side (buyer vs seller; "both" shows the buyer ladder).
export function AddSalesClientForm({
  realtors,
  action,
}: {
  realtors: Realtor[];
  action: (fd: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<DealSide | "">("");

  const stageOptions =
    side === "seller" ? SELLER_STAGE_LABEL : BUYER_STAGE_LABEL;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={buttonClass("primary")}>
        <Plus className="h-4 w-4" /> Add buyer / seller
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await action(fd);
        setOpen(false);
        setSide("");
      }}
      className="glass space-y-5 p-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="h-display text-base text-ink">New buyer / seller</h3>
        <span className="text-xs text-ink/45">Shows up here and in Clients</span>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Name *">
          <input name="name" required className={inputClass} placeholder="Client name" />
        </Field>
        <Field label="Side *">
          <select
            name="deal_side"
            required
            value={side}
            onChange={(e) => setSide(e.target.value as DealSide | "")}
            className={inputClass}
          >
            <option value="" disabled>
              Select…
            </option>
            {Object.entries(DEAL_SIDE_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Email">
          <input name="email" type="email" className={inputClass} placeholder="name@email.com" />
        </Field>
        <Field label="Phone">
          <PhoneInput name="phone" />
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
        <Field label="Stage">
          <select name="sales_stage" defaultValue="" className={inputClass}>
            <option value="">—</option>
            {Object.entries(stageOptions).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Address (mesmas colunas billing_* do cliente, sem o rótulo "billing"). */}
      <div className="border-t border-black/[0.06] pt-5">
        <h4 className="mb-3 text-sm font-bold text-ink">Address</h4>
        <AddressFields names={ADDRESS_NAMES} />
      </div>

      {/* Co-client (spouse / partner on the name). */}
      <div className="border-t border-black/[0.06] pt-5">
        <h4 className="mb-3 text-sm font-bold text-ink">
          Co-client <span className="font-normal text-ink/45">(spouse / partner on the name)</span>
        </h4>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Name">
            <input name="co_client_name" className={inputClass} />
          </Field>
          <Field label="Email">
            <input name="co_client_email" type="email" className={inputClass} />
          </Field>
          <Field label="Phone">
            <PhoneInput name="co_client_phone" />
          </Field>
        </div>
      </div>

      {/* Preferences + notes. */}
      <div className="border-t border-black/[0.06] pt-5">
        <div className="mb-4 flex flex-wrap gap-6">
          <label className="flex items-center gap-2.5 text-sm text-ink/80">
            <input type="checkbox" name="email_notifications" defaultChecked className="h-4 w-4 accent-[#198577]" />
            Email notifications
          </label>
          <label className="flex items-center gap-2.5 text-sm text-ink/80">
            <input type="checkbox" name="sms_notifications" className="h-4 w-4 accent-[#198577]" />
            SMS notifications
          </label>
        </div>
        <Field label="Internal notes">
          <textarea name="notes" rows={3} className={inputClass} placeholder="Notes that won't be shared with the client." />
        </Field>
      </div>

      <div className="flex gap-3">
        <button type="submit" className={buttonClass("primary")}>
          Add client
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSide("");
          }}
          className={buttonClass("ghost")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
