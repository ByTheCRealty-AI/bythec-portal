"use client";

// Form de EDIÇÃO de propriedade (client) — reativo ao Type: For Sale mostra a
// seção Sale e esconde Commission(seasonal) + Lease/rent; rental mostra rent.
// Espelha o PropriedadeNovoForm, mas com defaults do registro existente.
import { useState } from "react";
import Link from "next/link";
import { Field, inputClass, buttonClass } from "@/components/ui";
import {
  PROPERTY_TYPE_LABEL,
  SEASONAL_COMMISSION_BASE_LABEL,
  RENT_COLLECTION_LABEL,
  type Property,
  type PropertyType,
} from "@/lib/types";
import { SaleFields } from "./SaleFields";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function PropriedadeEditForm({
  property: p,
  action,
  cleaners = [],
}: {
  property: Property;
  action: (fd: FormData) => void | Promise<void>;
  cleaners?: { id: string; name: string }[];
}) {
  const [type, setType] = useState<PropertyType>(p.property_type);
  const isRental = type === "year_round_rental" || type === "off_season_rental";
  const isForSale = type === "for_sale";

  return (
    <form action={action} className="space-y-8">
      <section className="glass p-6">
        <h2 className="h-display mb-5 text-base text-ink">Property</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Address *" hint="From our records, with unit number — never from Google.">
            <input name="address" required defaultValue={p.address} className={inputClass} />
          </Field>
          <Field label="Unit / apt">
            <input name="address2" defaultValue={p.address2 ?? ""} className={inputClass} />
          </Field>
          <Field label="Type *">
            <select
              name="property_type"
              required
              value={type}
              onChange={(e) => setType(e.target.value as PropertyType)}
              className={inputClass}
            >
              {Object.entries(PROPERTY_TYPE_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {!isForSale && (
        <section className="glass p-6">
          <h2 className="h-display mb-5 text-base text-ink">Commission</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Commission">
              <input
                name="commission_fee"
                type="number"
                step="0.01"
                defaultValue={p.commission_fee ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Seasonal commission %" hint="By the C seasonal cut. Default 10%.">
              <input
                name="seasonal_commission_pct"
                type="number"
                step="0.1"
                defaultValue={p.seasonal_commission_rate != null ? round1(p.seasonal_commission_rate * 100) : 10}
                className={inputClass}
              />
            </Field>
            <Field label="Commission based on" hint="Most homes: host payout. A few (e.g. Rainbow): total paid by guest.">
              <select
                name="seasonal_commission_base"
                defaultValue={p.seasonal_commission_base ?? "host_payout"}
                className={inputClass}
              >
                {Object.entries(SEASONAL_COMMISSION_BASE_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default cleaner" hint="Auto-fills the cleaner on new seasonal invoices. Editable per invoice.">
              <select name="default_cleaner_id" defaultValue={p.default_cleaner_id ?? ""} className={inputClass}>
                <option value="">No default</option>
                {cleaners.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default cleaner amount ($)" hint="What By the C pays this cleaner. Auto-fills new seasonal invoices.">
              <input
                name="default_cleaner_amount"
                type="number"
                step="0.01"
                min={0}
                defaultValue={p.default_cleaner_amount ?? ""}
                className={inputClass}
              />
            </Field>
          </div>
        </section>
      )}

      {isForSale && (
        <SaleFields
          defaults={{ price: p.sale_price, rate: p.sale_commission_rate, amount: p.sale_commission }}
        />
      )}

      {isRental && (
        <section className="glass p-6">
          <h2 className="h-display mb-5 text-base text-ink">Lease and rent</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Monthly rent (USD)">
              <input name="rent_price" type="number" step="0.01" defaultValue={p.rent_price ?? ""} className={inputClass} />
            </Field>
            <Field label="Rent due day">
              <input name="rent_due_day" type="number" min={1} max={31} defaultValue={p.rent_due_day ?? ""} className={inputClass} />
            </Field>
            <Field label="Lease start">
              <input name="rental_start" type="date" defaultValue={p.rental_start ?? ""} className={inputClass} />
            </Field>
            <Field label="Lease end">
              <input name="rental_end" type="date" defaultValue={p.rental_end ?? ""} className={inputClass} />
            </Field>
            <Field label="Frequency">
              <select name="rent_frequency" defaultValue={p.rent_frequency ?? "monthly"} className={inputClass}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </Field>
            <Field label="Rent collection" hint="Who collects the rent from the tenant. Rent + commission are tracked either way.">
              <select name="rent_collection" defaultValue={p.rent_collection ?? "bythec"} className={inputClass}>
                {Object.entries(RENT_COLLECTION_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>
      )}

      <section className="glass p-6">
        <h2 className="h-display mb-5 text-base text-ink">Notes</h2>
        <Field label="Internal notes">
          <textarea name="notes" rows={3} defaultValue={p.notes ?? ""} className={inputClass} />
        </Field>

        <div className="mt-5 rounded-xl border border-black/[0.08] bg-black/[0.015] p-4">
          <p className="text-sm font-semibold text-ink">Accept rental applications on the website</p>
          <p className="mt-1 text-xs text-ink/55">
            Check which rental type(s) this property accepts. It appears on the public application form (/apply)
            only for the types you select — an applicant who picks &quot;Year-round&quot; sees only year-round
            properties, and &quot;Winter&quot; sees only winter ones.
          </p>
          <div className="mt-3 flex flex-col gap-2.5">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink/80">
              <input type="checkbox" name="accepts_year_round" value="1" defaultChecked={p.accepts_year_round ?? false} className="h-4 w-4 accent-[#198577]" />
              Year-round rental
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink/80">
              <input type="checkbox" name="accepts_winter" value="1" defaultChecked={p.accepts_winter ?? false} className="h-4 w-4 accent-[#198577]" />
              Winter / off-season rental
            </label>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className={buttonClass("primary")}>
          Save changes
        </button>
        <Link href={`/propriedades/${p.id}`} className={buttonClass("ghost")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
