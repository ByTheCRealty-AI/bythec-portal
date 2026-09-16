import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, buttonClass, Card, NoAccess } from "@/components/ui";
import { PROPERTY_TYPE_FLAGS, type Property } from "@/lib/types";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { Home, Plus, Archive, FolderUp, DoorOpen } from "lucide-react";
import Link from "next/link";
import { PropertiesTable } from "./PropertiesTable";

export const dynamic = "force-dynamic";

type PropertyRow = Property & {
  owner: { id: string; name: string } | null;
  tenant: { id: string; name: string } | null;
};

// archivedView=true (owner only): mostra arquivadas em vez de ativas, pra owner
// alcançar o registro e poder hard-deletar. Default permanece intocado (ativas).
async function load(typeFilter?: string, archivedView = false, vacantKind = "") {
  try {
    const supabase = createClient();
    let q = supabase
      .from("properties")
      .select("*, owner:owner_id (id, name), tenant:tenant_id (id, name)")
      .order("address", { ascending: true });
    q = archivedView ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    // O filtro é por FLAG (0042): uma casa temporada + inverno aparece nos DOIS
    // filtros. Com o property_type derivado ela só apareceria em um.
    // O valor vem da URL, então só aceita nome de flag conhecido — nunca passa
    // string arbitrária como nome de coluna.
    const flag = PROPERTY_TYPE_FLAGS.find((f) => f.flag === typeFilter)?.flag;
    if (flag) q = q.eq(flag, true);
    // "Vacant rentals": sem inquilino E anual ou inverno. Casa vendida sai no JS
    // (neq no PostgREST também jogaria fora sale_status NULL).
    if (typeFilter === VACANT) {
      q = q.is("tenant_id", null);
      // Sub-filtro por flag (casa anual E inverno aparece nos dois).
      if (vacantKind === "year_round") q = q.eq("is_year_round", true);
      else if (vacantKind === "winter") q = q.eq("is_winter", true);
      else q = q.or("is_year_round.eq.true,is_winter.eq.true");
    }
    const { data, error } = await q;
    if (error) throw error;
    let rows = (data ?? []) as unknown as PropertyRow[];
    if (typeFilter === VACANT) rows = rows.filter((p) => p.sale_status !== "sold");
    return { ok: true as const, properties: rows };
  } catch {
    return { ok: false as const, properties: [] as PropertyRow[] };
  }
}

// Filtro especial (não é flag): casas anuais/inverno sem inquilino.
const VACANT = "vacant";

async function countVacant() {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("properties")
      .select("sale_status, is_year_round, is_winter")
      .is("archived_at", null)
      .is("tenant_id", null)
      .or("is_year_round.eq.true,is_winter.eq.true");
    const rows = ((data ?? []) as { sale_status: string | null; is_year_round: boolean; is_winter: boolean }[]).filter(
      (p) => p.sale_status !== "sold"
    );
    return {
      all: rows.length,
      year_round: rows.filter((p) => p.is_year_round).length,
      winter: rows.filter((p) => p.is_winter).length,
    };
  } catch {
    return null;
  }
}

const VACANT_KINDS = [
  { value: "", label: "All vacant", key: "all" },
  { value: "year_round", label: "Year-round only", key: "year_round" },
  { value: "winter", label: "Winter only", key: "winter" },
] as const;

const FILTERS = [
  { value: "", label: "All" },
  ...PROPERTY_TYPE_FLAGS.map(({ flag, label }) => ({ value: flag, label })),
];

export default async function PropriedadesPage({
  searchParams,
}: {
  searchParams: { tipo?: string; q?: string; archived?: string; v?: string };
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

  // Toggle "Archived" = staff interno (owner/manager/secretary, via properties.edit).
  // Realtor (properties.own) NÃO vê arquivadas. Não-autorizado forçando ?archived=1
  // cai no default (ativas). RLS no banco também segura.
  const canArchived = can(profile, "properties.edit");
  const active = searchParams.tipo ?? "";
  const archivedView = canArchived && searchParams.archived === "1";
  // Só aceita valor conhecido vindo da URL.
  const vacantKind = VACANT_KINDS.find((k) => k.value && k.value === searchParams.v)?.value ?? "";
  const [{ ok, properties }, vacantCount] = await Promise.all([
    load(active || undefined, archivedView, vacantKind),
    countVacant(),
  ]);

  // Preserva tipo + busca ao alternar entre Active/Archived.
  const tipoQs = active ? `tipo=${active}&` : "";
  const qQs = searchParams.q ? `q=${encodeURIComponent(searchParams.q)}&` : "";

  return (
    <>
      <PageHeader
        title="Properties"
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

      {/* Staff interno: alternar entre ativas e arquivadas */}
      {canArchived && (
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
        {!archivedView && (
          <>
            <span className="mx-1 w-px self-stretch bg-black/10" aria-hidden />
            <Link
              href={`/propriedades?tipo=${VACANT}`}
              title="No tenant · Year-Round or Off-Season (winter) rental · not sold"
              className={
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition " +
                (active === VACANT
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-primary/25 bg-white text-primary/80 hover:border-primary/40 hover:text-primary")
              }
            >
              <DoorOpen className="h-3.5 w-3.5" /> Vacant rentals
              {vacantCount != null && (
                <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">
                  {vacantCount.all}
                </span>
              )}
            </Link>
          </>
        )}
      </div>

      {active === VACANT && !archivedView && (
        <div className="-mt-3 mb-5">
          <div className="mb-2 flex flex-wrap gap-2">
            {VACANT_KINDS.map((k) => {
              const on = vacantKind === k.value;
              const color =
                k.value === "year_round"
                  ? on
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-blue-200 bg-white text-blue-700/80 hover:border-blue-300"
                  : k.value === "winter"
                    ? on
                      ? "border-orange-300 bg-orange-50 text-orange-700"
                      : "border-orange-200 bg-white text-orange-700/80 hover:border-orange-300"
                    : on
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-black/10 bg-white text-ink/60 hover:text-ink hover:border-black/20";
              return (
                <Link
                  key={k.key}
                  href={`/propriedades?tipo=${VACANT}${k.value ? `&v=${k.value}` : ""}`}
                  className={"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition " + color}
                >
                  {k.label}
                  {vacantCount != null && <span className="text-[10px] font-bold opacity-70">{vacantCount[k.key]}</span>}
                </Link>
              );
            })}
          </div>
          <p className="text-xs text-ink/50">
            Year-round and off-season (winter) rentals with no tenant right now. Sold houses are left out.
          </p>
        </div>
      )}

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
          activeType={active}
        />
      )}
    </>
  );
}
