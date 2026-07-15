import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { BulkImportAll } from "@/components/inline-forms/BulkImportAll";
import { importPropertyDocumentsAction } from "../actions";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// Tela "importar tudo": pega a pasta raiz Property Manager uma vez e importa os
// documentos de todas as propriedades. Gate: properties.edit OU operations.edit.
export default async function ImportarDocumentosPage() {
  const profile = await getProfile();
  if (!can(profile, "properties.edit") && !can(profile, "operations.edit")) {
    redirect("/propriedades");
  }

  const supabase = createClient();
  const [{ data: propsData }, { data: clientsData }, { data: docsData }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, address, address2, archived_at, tenant:tenant_id (id, name)")
      .order("address", { ascending: true }),
    supabase.from("clients").select("id, name, archived_at").order("name", { ascending: true }),
    supabase
      .from("documents")
      .select("parent_id, source_path")
      .eq("parent_type", "property")
      .not("source_path", "is", null),
  ]);

  const properties = (
    (propsData ?? []) as unknown as {
      id: string;
      address: string | null;
      address2: string | null;
      archived_at: string | null;
      tenant: { id: string; name: string } | null;
    }[]
  ).map((p) => ({
    id: p.id,
    address: p.address,
    address2: p.address2,
    archived: p.archived_at !== null,
    tenant: p.tenant,
  }));

  const clients = ((clientsData ?? []) as { id: string; name: string; archived_at: string | null }[]).map((c) => ({
    id: c.id,
    name: c.name,
    archived: c.archived_at !== null,
  }));

  const existingByProperty: Record<string, string[]> = {};
  for (const d of (docsData ?? []) as { parent_id: string; source_path: string | null }[]) {
    if (!d.source_path) continue;
    (existingByProperty[d.parent_id] ??= []).push(d.source_path);
  }

  return (
    <>
      <Link
        href="/propriedades"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink/60 transition hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back to properties
      </Link>
      <PageHeader
        title="Import all documents"
        subtitle="Bring every property's documents in from your Property Manager folder — one pick."
      />
      <BulkImportAll
        properties={properties}
        clients={clients}
        existingByProperty={existingByProperty}
        action={importPropertyDocumentsAction}
      />
    </>
  );
}
