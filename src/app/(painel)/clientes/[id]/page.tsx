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
    <div className="flex flex-col gap-0.5 border-b border-black/[0.06] py-2.5 last:border-0">
      <span className="text-xs uppercase tracking-wider text-ink/45">{label}</span>
      <span className="text-sm text-ink/90">{value || "—"}</span>
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
        <h3 className="h-display mb-3 text-sm text-ink/70">Identification</h3>
        <Row label="Name" value={client.name} />
        <Row label="Type" value={CLIENT_TYPE_LABEL[client.client_type]} />
        <Row label="Email" value={client.email} />
        <Row label="Phone" value={client.phone} />
      </Card>
      <Card>
        <h3 className="h-display mb-3 text-sm text-ink/70">Billing and co-client</h3>
        <Row label="Address" value={client.billing_address} />
        <Row label="Unit / apt" value={client.billing_address2} />
        <Row label="Co-client" value={client.co_client_name} />
        <Row
          label="Notifications"
          value={[
            client.email_notifications ? "Email" : null,
            client.sms_notifications ? "SMS" : null,
          ].filter(Boolean).join(" · ") || "None"}
        />
      </Card>
      {client.notes && (
        <Card className="md:col-span-2">
          <h3 className="h-display mb-2 text-sm text-ink/70">Notes</h3>
          <p className="whitespace-pre-wrap text-sm text-ink/80">{client.notes}</p>
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
          title="No properties"
          message="Attach the first property to this client. Owner and address are auto-filled."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {properties.map((p) => (
            <Card key={p.id} className="glass-hover">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{p.address}</p>
                  {p.address2 && <p className="text-xs text-ink/45">{p.address2}</p>}
                </div>
                <Badge tone="orange">{PROPERTY_TYPE_LABEL[p.property_type]}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="block text-ink/45">Commission</span>
                  <span className="text-ink/85">{p.commission_fee ?? "—"}</span>
                </div>
                <div>
                  <span className="block text-ink/45">Rent</span>
                  <span className="text-ink/85">{money(p.rent_price)}</span>
                </div>
                {p.rental_start && (
                  <div className="col-span-2">
                    <span className="block text-ink/45">Lease</span>
                    <span className="text-ink/85">{date(p.rental_start)} — {date(p.rental_end)}</span>
                  </div>
                )}
              </div>
              <div className="mt-4">
                <Link href={`/propriedades/${p.id}`} className="text-xs font-semibold text-primary hover:underline">
                  View property →
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
    <EmptyState icon={icon} title={`${label} under construction`} message={msg} />
  );

  return (
    <>
      <PageHeader
        title={client.name}
        subtitle={CLIENT_TYPE_LABEL[client.client_type]}
        action={
          <div className="flex items-center gap-3">
            {archived && <Badge tone="muted">Archived</Badge>}
            <Link href={`/clientes/${client.id}/editar`} className={buttonClass("ghost")}>
              <Pencil className="h-4 w-4" /> Edit
            </Link>
            <ArchiveButton id={client.id} archived={archived} />
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: "details", label: "Details", content: detailsTab },
          { id: "properties", label: `Properties (${properties.length})`, content: propertiesTab },
          { id: "notes", label: "Notes", content: stub("Notes", <StickyNote className="h-6 w-6" />, "Polymorphic notes per client. Schema ready; UI in upcoming rounds.") },
          { id: "documents", label: "Documents", content: stub("Documents", <FileText className="h-6 w-6" />, "Multi-upload with filter by year. Schema ready; UI in upcoming rounds.") },
          { id: "requests", label: "Requests", content: stub("Requests", <Home className="h-6 w-6" />, "Linked tenant requests. Schema ready; UI in upcoming rounds.") },
        ]}
      />
    </>
  );
}
