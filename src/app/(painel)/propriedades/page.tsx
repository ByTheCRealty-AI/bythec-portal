import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, buttonClass, Card, NoAccess } from "@/components/ui";
import { PROPERTY_TYPE_LABEL, type Property } from "@/lib/types";
import { getProfile } from "@/lib/auth/session";
import { can, canDelete } from "@/lib/auth/capabilities";
import { Home, Plus, Archive, FolderUp } from "lucide-react";
import Link from "next/link";
import { PropertiesTable } from "./PropertiesTable";

export const dynamic = "force-dynamic";

type PropertyRow = Property & {
  owner: { id: string; name: string } | null;
  tenant: { id: string; name: string } | null;
};

// archivedView=true (owner only): mostra arquivadas em vez de ativas, pra owner
// alcançar o registro e poder hard-deletar. Default permanece intocado (ativas).
async function load(typeFilter?: string, archivedView = false) {
  try {
    const supabase = createClient();
    let q = supabase
      .from("properties")
      .select("*, owner:owner_id (id, name), tenant:tenant_id (id, name)")
      .order("address", { ascending: true });
    q = archivedView ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    if (typeFilter) q = q.eq("property_type", typeFilter);
    const { data, error } = await q;
    if (error) throw error;
    return { ok: true as const, properties: (data ?? []) as unknown as PropertyRow[] };
  } catch {
    return { ok: false as const, properties: [] as PropertyRow[] };
  }
}

const FILTERS = [
  { value: "", label: "All" },
  ...Object.entries(PROPERTY_TYPE_LABEL).map(([value, label]) => ({ value, label })),
];

export default async function PropriedadesPage({
  searchParams,
}: {
  searchParams: { tipo?: string; q?: string; archived?: string };
}) {
  const profile = await getProfile();
  // properties.edit = full (internos); properties.own = escopo do realtor (RLS).
  if (!can(profile, "properties.edit") && !can(profile, "properties.own")) {
    return (
      <>
        <PageHeader title="Properties" />
        <NoAccess />
      </>
    );
  }

  // Toggle "Archived" é OWNER ONLY. Não-owner forçando ?archived=1 cai no default.
  const isOwner = canDelete(profile);
  const active = searchParams.tipo ?? "";
  const archivedView = isOwner && searchParams.archived === "1";
  const { ok, properties } = await load(active || undefined, archivedView);

  // Preserva tipo + busca ao alternar entre Active/Archived.
  const tipoQs = active ? `tipo=${active}&` : "";
  const qQs = searchParams.q ? `q=${encodeURIComponent(searchParams.q)}&` : "";

  return (
    <>
      <PageHeader
        title="Properties"
        subtitle="Every property has an owner. Add a new one or attach it from the client's record."
        action={
          <div className="flex items-center gap-3">
            {can(profile, "properties.edit") && (
              <Link href="/propriedades/importar" className={buttonClass("ghost")}>
                <FolderUp className="h-4 w-4" /> Import documents
              </Link>
            )}
            <Link href="/propriedades/novo" className={buttonClass("primary")}>
              <Plus className="h-4 w-4" /> New property
            </Link>
          </div>
        }
      />

      {/* Owner only: alternar entre ativas e arquivadas */}
      {isOwner && (
        <div className="mb-4 flex gap-2">
          <Link
            href={`/propriedades?${tipoQs}${qQs}`.replace(/[?&]$/, "")}
            className={
              "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition " +
              (!archivedView
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-black/10 bg-white text-ink/60 hover:text-ink hover:border-black/20")
            }
          >
            Active
          </Link>
          <Link
            href={`/propriedades?${tipoQs}${qQs}archived=1`}
            className={
              "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition " +
              (archivedView
                ? "border-ink/30 bg-black/[0.04] text-ink/80"
                : "border-black/10 bg-white text-ink/60 hover:text-ink hover:border-black/20")
            }
          >
            <Archive className="h-3.5 w-3.5" /> Archived
          </Link>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive = active === f.value;
          const archQs = archivedView ? (f.value ? "&archived=1" : "?archived=1") : "";
          return (
            <Link
              key={f.value || "all"}
              href={(f.value ? `/propriedades?tipo=${f.value}` : "/propriedades") + archQs}
              className={
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition " +
                (isActive
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-black/10 bg-white text-ink/60 hover:text-ink hover:border-black/20")
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {!ok && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06] text-sm text-ink/70">
          Database not connected. Check the environment variables{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-primary">SUPABASE_SERVICE_ROLE_KEY</code>.
        </Card>
      )}

      {properties.length === 0 ? (
        archivedView ? (
          <EmptyState
            icon={<Archive className="h-6 w-6" />}
            title="No archived properties"
            message="Properties you archive show up here, ready to restore or permanently delete."
            cta={
              <Link href="/propriedades" className={buttonClass("ghost")}>
                Back to active properties
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={<Home className="h-6 w-6" />}
            title="No properties"
            message="Add a property and pick its owner, or open a client and attach their home."
            cta={
              <Link href="/propriedades/novo" className={buttonClass("primary")}>
                <Plus className="h-4 w-4" /> New property
              </Link>
            }
          />
        )
      ) : (
        <PropertiesTable
          properties={properties}
          initialQuery={searchParams.q ?? ""}
          archivedView={archivedView}
        />
      )}
    </>
  );
}
