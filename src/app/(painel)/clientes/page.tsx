import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, buttonClass, Card, NoAccess } from "@/components/ui";
import { CLIENT_TYPE_LABEL, type Client } from "@/lib/types";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { Users, Plus } from "lucide-react";
import Link from "next/link";
import { ClientsTable } from "./ClientsTable";

export const dynamic = "force-dynamic";

async function load(typeFilter?: string) {
  try {
    const supabase = createClient();
    let q = supabase
      .from("clients")
      .select("*")
      .is("archived_at", null) // TRAVADO: lista filtra arquivados por padrão
      .order("name", { ascending: true });
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
  searchParams: { tipo?: string; q?: string };
}) {
  const profile = await getProfile();
  if (!can(profile, "clients.edit")) {
    return (
      <>
        <PageHeader title="Clients" />
        <NoAccess />
      </>
    );
  }

  const active = searchParams.tipo ?? "";
  const { ok, clients } = await load(active || undefined);

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

      {/* Filtro por tipo (chips) */}
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive = active === f.value;
          return (
            <Link
              key={f.value || "all"}
              href={f.value ? `/clientes?tipo=${f.value}` : "/clientes"}
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
      ) : (
        <ClientsTable clients={clients} initialQuery={searchParams.q ?? ""} />
      )}
    </>
  );
}
