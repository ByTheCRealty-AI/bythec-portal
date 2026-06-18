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
      <PageHeader title="Editar propriedade" subtitle="Mudar o tipo carrega o histórico junto." />
      <form action={action} className="space-y-6">
        <section className="glass p-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Endereço *" hint="Da base, com unit number — nunca do Google.">
              <input name="address" required defaultValue={p.address} className={inputClass} />
            </Field>
            <Field label="Unidade / apto">
              <input name="address2" defaultValue={p.address2 ?? ""} className={inputClass} />
            </Field>
            <Field label="Tipo *">
              <select name="property_type" required defaultValue={p.property_type} className={inputClass}>
                {Object.entries(PROPERTY_TYPE_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Comissão">
              <input name="commission_fee" type="number" step="0.01" defaultValue={p.commission_fee ?? ""} className={inputClass} />
            </Field>
            <Field label="Aluguel mensal (USD)">
              <input name="rent_price" type="number" step="0.01" defaultValue={p.rent_price ?? ""} className={inputClass} />
            </Field>
            <Field label="Dia de vencimento">
              <input name="rent_due_day" type="number" min={1} max={31} defaultValue={p.rent_due_day ?? ""} className={inputClass} />
            </Field>
            <Field label="Início do lease">
              <input name="rental_start" type="date" defaultValue={p.rental_start ?? ""} className={inputClass} />
            </Field>
            <Field label="Fim do lease">
              <input name="rental_end" type="date" defaultValue={p.rental_end ?? ""} className={inputClass} />
            </Field>
            <Field label="Frequência">
              <select name="rent_frequency" defaultValue={p.rent_frequency ?? "monthly"} className={inputClass}>
                <option value="monthly">Mensal</option>
                <option value="quarterly">Trimestral</option>
                <option value="annual">Anual</option>
              </select>
            </Field>
          </div>
          <div className="mt-5">
            <Field label="Notas">
              <textarea name="notes" rows={3} defaultValue={p.notes ?? ""} className={inputClass} />
            </Field>
          </div>
        </section>
        <div className="flex gap-3">
          <button type="submit" className={buttonClass("primary")}>Salvar alterações</button>
          <Link href={`/propriedades/${p.id}`} className={buttonClass("ghost")}>Cancelar</Link>
        </div>
      </form>
    </>
  );
}
