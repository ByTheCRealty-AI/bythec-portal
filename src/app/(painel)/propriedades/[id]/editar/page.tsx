import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { type Property } from "@/lib/types";
import { updatePropriedadeAction } from "../../actions";
import { PropriedadeEditForm } from "../../PropriedadeEditForm";

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
      <PropriedadeEditForm property={p} action={action} />
    </>
  );
}
