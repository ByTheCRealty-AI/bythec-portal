import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, buttonClass, Card, NoAccess } from "@/components/ui";
import { CLIENT_TYPE_LABEL, type Client } from "@/lib/types";
import { getProfile } from "@/lib/auth/session";
import { can, canDelete } from "@/lib/auth/capabilities";
import { Users, Plus, Archive } from "lucide-react";
import Link from "next/link";
import { ClientsTable } from "./ClientsTable";

export const dynamic = "force-dynamic";

// archivedView=true (owner only): mostra arquivados em vez de ativos, pra owner
// alcançar o registro e poder hard-deletar. Default permanece intocado (ativos).
async function load(typeFilter?: string, archivedView = false) {
  try {
    const supabase = createClient();
    let q = supabase.from("clients").select("*").order("name", { ascending: true });
    q = archivedView ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    if (typeFilter) q = q.eq("client_type", typeFilter);
    const { data, error } = await q;
    if (error) throw error;
    return { ok: true as const, clients: (data ?? []) as Client[] };
  } catch {
    return { ok: false as const, clients: [] as Client[] };
  }
}

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  ...Object.entries(CLIENT_TYPE_LABEL).map(([value, label]) => ({ value, label })),
];

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: { tipo?: string; q?: string; archived?: string };
}) {
  const profile = await getProfile();
  // clients.edit = full (internos); clients.own = escopo do realtor (só os dele,
  // via RLS). Qualquer um dos dois entra na tela.
  if (!can(profile, "clients.edit") && !can(profile, "clients.own")) {
    return (
      <>
        <PageHeader title="Clients" />
        <NoAccess />
      </>
    );
  }

  // Toggle "Archived" é OWNER ONLY. Se um não-owner forçar ?archived=1 na URL,
  // ignoramos (cai no default = ativos). RLS no banco também segura.
  const isOwner = canDelete(profile);
  const active = searchParams.tipo ?? "";
  const archivedView = isOwner && searchParams.archived === "1";
  const { ok, clients } = await load(active || undefined, archivedView);

  // Preserva tipo + busca ao alternar entre Active/Archived.
  const tipoQs = active ? `tipo=${active}&` : "";
  const qQs = searchParams.q ? `q=${encodeURIComponent(searchParams.q)}&` : "";

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="The parent record. Properties belong to a client."
        action={
          <Link href="/clientes/novo" className={buttonClass("primary")}>
            <Plus className="h-4 w-4" /> New client
          </Link>
        }
      />

      {/* Owner only: alternar entre ativos e arquivados */}
      {isOwner && (
        <div className="mb-4 flex gap-2">
          <Link
            href={`/clientes?${tipoQs}${qQs}`.replace(/[?&]$/, "")}
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
            href={`/clientes?${tipoQs}${qQs}archived=1`}
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

      {/* Filtro por tipo (chips) */}
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive = active === f.value;
          const archQs = archivedView ? (f.value ? "&archived=1" : "?archived=1") : "";
          return (
            <Link
              key={f.value || "all"}
              href={(f.value ? `/clientes?tipo=${f.value}` : "/clientes") + archQs}
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

      {clients.length === 0 ? (
        archivedView ? (
          <EmptyState
            icon={<Archive className="h-6 w-6" />}
            title="No archived clients"
            message="Clients you archive show up here, ready to restore or permanently delete."
            cta={
              <Link href="/clientes" className={buttonClass("ghost")}>
                Back to active clients
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No clients yet"
            message="Add the first client. The property comes next, attached to them."
            cta={
              <Link href="/clientes/novo" className={buttonClass("primary")}>
                <Plus className="h-4 w-4" /> New client
              </Link>
            }
          />
        )
      ) : (
        <ClientsTable
          clients={clients}
          initialQuery={searchParams.q ?? ""}
          archivedView={archivedView}
        />
      )}
    </>
  );
}
