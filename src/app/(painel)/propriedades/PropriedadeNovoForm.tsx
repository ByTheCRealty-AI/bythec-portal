"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, inputClass, buttonClass, EmptyState } from "@/components/ui";
import { PlusCircle } from "lucide-react";
import {
  PROPERTY_TYPE_LABEL,
  SEASONAL_COMMISSION_BASE_LABEL,
  type PropertyType,
} from "@/lib/types";
import { createPropriedadeStandaloneAction } from "./actions";

type OwnerOption = { id: string; name: string };

// Formulário standalone de criação de propriedade (/propriedades/novo). Owner é
// obrigatório (entidade-mãe) e escolhido num picker. Painel largo, seções com
// títulos, no mesmo estilo do ClienteForm.
export function PropriedadeNovoForm({ owners }: { owners: OwnerOption[] }) {
  const [type, setType] = useState<PropertyType | "">("");
  const isRental = type === "year_round_rental" || type === "off_season_rental";

  // Sem clientes cadastrados não dá pra pendurar propriedade. CTA pro fluxo de
  // criação de cliente (empty state nunca vazio).
  if (owners.length === 0) {
    return (
      <EmptyState
        icon={<PlusCircle className="h-6 w-6" />}
        title="No clients yet"
        message="A property always belongs to a client. Create the owner first, then attach their home."
        cta={
          <Link href="/clientes/novo" className={buttonClass("primary")}>
            Create the first client
          </Link>
        }
      />
    );
  }

  return (
    <form action={createPropriedadeStandaloneAction} className="space-y-8">
      {/* Owner + identificação da propriedade */}
      <section className="glass p-6">
        <h2 className="h-display mb-5 text-base text-ink">Owner and property</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Owner *" hint="The client this property belongs to. Required.">
            <select name="owner_id" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select a client…
              </option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type *">
            <select
              name="property_type"
              required
              value={type}
              onChange={(e) => setType(e.target.value as PropertyType)}
              className={inputClass}
            >
              <option value="" disabled>
                Select…
              </option>
              {Object.entries(PROPERTY_TYPE_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Address *" hint="From our records, with unit number — never from Google.">
            <input
              name="address"
              required
              className={inputClass}
              placeholder="12 Rainbow Ave, East Falmouth MA 02536"
            />
          </Field>
          <Field label="Unit / apt">
            <input name="address2" className={inputClass} placeholder="Unit 1" />
          </Field>
        </div>
      </section>

      {/* Comissão */}
      <section className="glass p-6">
        <h2 className="h-display mb-5 text-base text-ink">Commission</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Commission (% / amount per home)"
            hint="For vacation rentals, the % is confirmed with Andrea."
          >
            <input
              name="commission_fee"
              type="number"
              step="0.01"
              className={inputClass}
              placeholder="12.50"
            />
          </Field>
          <Field label="Seasonal commission %" hint="By the C seasonal cut. Default 10%.">
            <input
              name="seasonal_commission_pct"
              type="number"
              step="0.1"
              defaultValue="10"
              className={inputClass}
              placeholder="10"
            />
          </Field>
          <Field
            label="Commission based on"
            hint="Most homes: host payout. A few (e.g. Rainbow): total paid by guest."
          >
            <select name="seasonal_commission_base" defaultValue="host_payout" className={inputClass}>
              {Object.entries(SEASONAL_COMMISSION_BASE_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {/* Aluguel — só para year-round / off-season (vacation rental não tem). */}
      {isRental && (
        <section className="glass p-6">
          <h2 className="h-display mb-5 text-base text-ink">Lease and rent</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
              <select name="rent_frequency" defaultValue="monthly" className={inputClass}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </Field>
          </div>
        </section>
      )}

      {/* Notas */}
      <section className="glass p-6">
        <h2 className="h-display mb-5 text-base text-ink">Notes</h2>
        <Field label="Internal notes">
          <textarea
            name="notes"
            rows={3}
            className={inputClass}
            placeholder="Notes that won't be shared with the client."
          />
        </Field>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className={buttonClass("primary")}>
          Create property
        </button>
        <Link href="/propriedades" className={buttonClass("ghost")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
