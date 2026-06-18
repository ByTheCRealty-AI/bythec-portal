import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Badge, Card, buttonClass, EmptyState } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { PropriedadeForm } from "./PropriedadeForm";
import { ArchiveButton } from "./ArchiveButton";
import {
  CLIENT_TYPE_LABEL,
  PROPERTY_TYPE_LABEL,
  type Client,
  type Property,
} from "@/lib/types";
import { money, date } from "@/lib/format";
import { Home, Pencil, FileText, StickyNote } from "lucide-react";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/[0.05] py-2.5 last:border-0">
      <span className="text-xs uppercase tracking-wider text-white/40">{label}</span>
      <span className="text-sm text-white/85">{value || "—"}</span>
    </div>
  );
}

export default async function ClienteDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: clientData, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error || !clientData) notFound();
  const client = clientData as Client;

  // Propriedades penduradas neste cliente (não arquivadas).
  const { data: propsData } = await supabase
    .from("properties")
    .select("*")
    .eq("owner_id", client.id)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  const properties = (propsData ?? []) as Property[];

  const archived = client.archived_at !== null;

  // ---- Aba Details ----
  const detailsTab = (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Card>
        <h3 className="h-display mb-3 text-sm text-white/70">Identificação</h3>
        <Row label="Nome" value={client.name} />
        <Row label="Tipo" value={CLIENT_TYPE_LABEL[client.client_type]} />
        <Row label="E-mail" value={client.email} />
        <Row label="Telefone" value={client.phone} />
      </Card>
      <Card>
        <h3 className="h-display mb-3 text-sm text-white/70">Cobrança e co-cliente</h3>
        <Row label="Endereço" value={client.billing_address} />
        <Row label="Unidade / apto" value={client.billing_address2} />
        <Row label="Co-cliente" value={client.co_client_name} />
        <Row
          label="Notificações"
          value={[
            client.email_notifications ? "E-mail" : null,
            client.sms_notifications ? "SMS" : null,
          ].filter(Boolean).join(" · ") || "Nenhuma"}
        />
      </Card>
      {client.notes && (
        <Card className="md:col-span-2">
          <h3 className="h-display mb-2 text-sm text-white/70">Notas</h3>
          <p className="whitespace-pre-wrap text-sm text-white/75">{client.notes}</p>
        </Card>
      )}
    </div>
  );

  // ---- Aba Properties ----
  const propertiesTab = (
    <div className="space-y-5">
      <PropriedadeForm
        ownerId={client.id}
        ownerName={client.name}
        ownerBillingAddress={client.billing_address}
      />

      {properties.length === 0 ? (
        <EmptyState
          icon={<Home className="h-6 w-6" />}
          title="Sem propriedades"
          message="Pendure a primeira propriedade neste cliente. Owner e endereço são auto-preenchidos."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {properties.map((p) => (
            <Card key={p.id} className="glass-hover">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{p.address}</p>
                  {p.address2 && <p className="text-xs text-white/40">{p.address2}</p>}
                </div>
                <Badge tone="orange">{PROPERTY_TYPE_LABEL[p.property_type]}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="block text-white/40">Comissão</span>
                  <span className="text-white/80">{p.commission_fee ?? "—"}</span>
                </div>
                <div>
                  <span className="block text-white/40">Aluguel</span>
                  <span className="text-white/80">{money(p.rent_price)}</span>
                </div>
                {p.rental_start && (
                  <div className="col-span-2">
                    <span className="block text-white/40">Lease</span>
                    <span className="text-white/80">{date(p.rental_start)} — {date(p.rental_end)}</span>
                  </div>
                )}
              </div>
              <div className="mt-4">
                <Link href={`/propriedades/${p.id}`} className="text-xs font-semibold text-primary hover:underline">
                  Ver propriedade →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // ---- Abas stub (Notes, Documents, Requests) ----
  const stub = (label: string, icon: React.ReactNode, msg: string) => (
    <EmptyState icon={icon} title={`${label} em construção`} message={msg} />
  );

  return (
    <>
      <PageHeader
        title={client.name}
        subtitle={CLIENT_TYPE_LABEL[client.client_type]}
        action={
          <div className="flex items-center gap-3">
            {archived && <Badge tone="muted">Arquivado</Badge>}
            <Link href={`/clientes/${client.id}/editar`} className={buttonClass("ghost")}>
              <Pencil className="h-4 w-4" /> Editar
            </Link>
            <ArchiveButton id={client.id} archived={archived} />
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: "details", label: "Detalhes", content: detailsTab },
          { id: "properties", label: `Propriedades (${properties.length})`, content: propertiesTab },
          { id: "notes", label: "Notas", content: stub("Notas", <StickyNote className="h-6 w-6" />, "Notas polimórficas por cliente. Schema pronto; UI nas próximas rodadas.") },
          { id: "documents", label: "Documentos", content: stub("Documentos", <FileText className="h-6 w-6" />, "Multi-upload com filtro por ano. Schema pronto; UI nas próximas rodadas.") },
          { id: "requests", label: "Requests", content: stub("Requests", <Home className="h-6 w-6" />, "Tenant requests vinculados. Schema pronto; UI nas próximas rodadas.") },
        ]}
      />
    </>
  );
}
