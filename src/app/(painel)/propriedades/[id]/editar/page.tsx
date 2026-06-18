import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Field, inputClass, buttonClass } from "@/components/ui";
import { PROPERTY_TYPE_LABEL, type Property } from "@/lib/types";
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
      <PageHeader title="Edit property" subtitle="Changing the type carries the history with it." />
      <form action={action} className="space-y-6">
        <section className="glass p-6">
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
            <Field label="Commission">
              <input name="commission_fee" type="number" step="0.01" defaultValue={p.commission_fee ?? ""} className={inputClass} />
            </Field>
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
          <div className="mt-5">
            <Field label="Notes">
              <textarea name="notes" rows={3} defaultValue={p.notes ?? ""} className={inputClass} />
            </Field>
          </div>
        </section>
        <div className="flex gap-3">
          <button type="submit" className={buttonClass("primary")}>Save changes</button>
          <Link href={`/propriedades/${p.id}`} className={buttonClass("ghost")}>Cancel</Link>
        </div>
      </form>
    </>
  );
}
