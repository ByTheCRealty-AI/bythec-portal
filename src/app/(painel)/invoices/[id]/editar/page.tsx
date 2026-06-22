import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader, NoAccess, Field, inputClass, buttonClass } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { updateInvoice } from "../../actions";
import { INVOICE_KIND_LABEL, type Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  const full = can(profile, "financials.full");
  const serviceOnly = !full && can(profile, "invoices.service");
  if (!full && !serviceOnly) {
    return (
      <>
        <PageHeader title="Edit invoice" />
        <NoAccess />
      </>
    );
  }

  const supabase = createClient();
  const { data, error } = await supabase.from("invoices").select("*").eq("id", params.id).single();
  if (error || !data) notFound();
  const invoice = data as Invoice;

  if (serviceOnly && invoice.kind === "seasonal") redirect("/invoices");

  const action = updateInvoice.bind(null, invoice.id);
  const numberLabel =
    invoice.kind === "seasonal" ? `Invoice #${invoice.invoice_number}` : `Service Invoice #${invoice.invoice_number}`;

  return (
    <>
      <PageHeader
        title={`Edit — ${numberLabel}`}
        subtitle={`${INVOICE_KIND_LABEL[invoice.kind]} · Light edit (due date and notes). Recreate to change amounts so the locked formula stays consistent.`}
      />
      <form action={action} className="max-w-xl space-y-6">
        <section className="glass space-y-5 p-6">
          <Field label="Due date">
            <input name="due_date" type="date" defaultValue={invoice.due_date ?? ""} className={inputClass} />
          </Field>
          <Field label="Notes">
            <textarea name="notes" rows={4} defaultValue={invoice.notes ?? ""} className={inputClass} />
          </Field>
        </section>
        <div className="flex items-center gap-3">
          <button type="submit" className={buttonClass("primary")}>Save changes</button>
          <Link href={`/invoices/${invoice.id}`} className={buttonClass("ghost")}>Cancel</Link>
        </div>
      </form>
    </>
  );
}
