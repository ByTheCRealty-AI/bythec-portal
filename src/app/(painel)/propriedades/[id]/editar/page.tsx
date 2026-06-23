import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Field, inputClass, buttonClass } from "@/components/ui";
import { PROPERTY_TYPE_LABEL, SEASONAL_COMMISSION_BASE_LABEL, type Property } from "@/lib/types";
import { updatePropriedadeAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditarPropriedadePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data, error } = await supabase.from("properties").select("*").eq("id", params.id).single();
  if (error || !data) notFound();
  const p = data as Property;
  const action = updatePropriedadeAction.bind(null, p.id);

  return (
    <>
      <PageHeader
        title={`Edit — ${p.address}`}
        subtitle="Editing never erases history. Changing the type carries the history with it."
      />
      <form action={action} className="space-y-8">
        {/* Identificação da propriedade */}
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
              <select name="property_type" required defaultValue={p.property_type} className={inputClass}>
                {Object.entries(PROPERTY_TYPE_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* Comissão */}
        <section className="glass p-6">
          <h2 className="h-display mb-5 text-base text-ink">Commission</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Commission">
              <input name="commission_fee" type="number" step="0.01" defaultValue={p.commission_fee ?? ""} className={inputClass} />
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
              <select name="seasonal_commission_base" defaultValue={p.seasonal_commission_base ?? "host_payout"} className={inputClass}>
                {Object.entries(SEASONAL_COMMISSION_BASE_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* Aluguel */}
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
          </div>
        </section>

        {/* Notas */}
        <section className="glass p-6">
          <h2 className="h-display mb-5 text-base text-ink">Notes</h2>
          <Field label="Internal notes">
            <textarea name="notes" rows={3} defaultValue={p.notes ?? ""} className={inputClass} />
          </Field>
        </section>

        <div className="flex items-center gap-3">
          <button type="submit" className={buttonClass("primary")}>Save changes</button>
          <Link href={`/propriedades/${p.id}`} className={buttonClass("ghost")}>Cancel</Link>
        </div>
      </form>
    </>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
