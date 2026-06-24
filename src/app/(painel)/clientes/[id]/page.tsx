import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Badge, Card, buttonClass, EmptyState } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { PropriedadeForm } from "./PropriedadeForm";
import { ArchiveButton } from "./ArchiveButton";
import { DeleteButton } from "./DeleteButton";
import { BackButton } from "./BackButton";
import { getProfile } from "@/lib/auth/session";
import { canDelete } from "@/lib/auth/capabilities";
import {
  CLIENT_TYPE_LABEL,
  PROPERTY_TYPE_LABEL,
  type Client,
  type Property,
  type Note,
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

  // Propriedades que este cliente ALUGA (tenant), não arquivadas.
  const { data: rentedData } = await supabase
    .from("properties")
    .select("*")
    .eq("tenant_id", client.id)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  const rentedProperties = (rentedData ?? []) as Property[];

  // Notes (polymorphic) attached to this client.
  const { data: notesData } = await supabase
    .from("notes")
    .select("id, body, year, created_at, updated_at, parent_type, parent_id")
    .eq("parent_type", "client")
    .eq("parent_id", client.id)
    .order("created_at", { ascending: false });
  const notes = (notesData ?? []) as Note[];

  const archived = client.archived_at !== null;

  // Owner-only: pode hard-delete (a UI só aparece pra owner; o banco reforça).
  const profile = await getProfile();
  const showDelete = canDelete(profile);

  // Compõe o endereço de cobrança estruturado em uma linha legível, pulando
  // partes vazias. Ex.: "123 Main St, Apt 4B · Hyannis, MA 02601".
  const billingAddress = (() => {
    const street = [client.billing_address, client.billing_address2]
      .filter(Boolean)
      .join(", ");
    const cityState = [client.billing_city, client.billing_state]
      .filter(Boolean)
      .join(", ");
    const locality = [cityState, client.billing_zip].filter(Boolean).join(" ");
    return [street, locality].filter(Boolean).join(" · ");
  })();

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
        <Row label="Billing address" value={billingAddress} />
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

  // Card de propriedade reutilizado nos grupos "Owns" e "Renting".
  const propertyCard = (p: Property) => (
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
  );

  // ---- Aba Properties ----
  const propertiesTab = (
    <div className="space-y-5">
      <PropriedadeForm
        ownerId={client.id}
        ownerName={client.name}
        ownerBillingAddress={client.billing_address}
      />

      {properties.length === 0 && rentedProperties.length === 0 ? (
        <EmptyState
          icon={<Home className="h-6 w-6" />}
          title="No properties"
          message="Attach the first property to this client. Owner and address are auto-filled."
        />
      ) : (
        <div className="space-y-6">
          {properties.length > 0 && (
            <div className="space-y-3">
              <h3 className="h-display text-xs uppercase tracking-wider text-ink/45">Owns</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {properties.map((p) => propertyCard(p))}
              </div>
            </div>
          )}

          {rentedProperties.length > 0 && (
            <div className="space-y-3">
              <h3 className="h-display text-xs uppercase tracking-wider text-ink/45">Renting</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {rentedProperties.map((p) => propertyCard(p))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ---- Aba Notes (timeline polimórfica) ----
  const notesTab =
    notes.length === 0 ? (
      <EmptyState
        icon={<StickyNote className="h-6 w-6" />}
        title="No notes"
        message="Notes attached to this client appear here, newest first."
      />
    ) : (
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl border border-black/[0.07] bg-black/[0.015] p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-ink/45">
              <span>{date(n.created_at)}</span>
              {n.year && <span className="text-ink/35">· {n.year}</span>}
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink/80">{n.body || "—"}</p>
          </li>
        ))}
      </ul>
    );

  // ---- Abas stub (Documents, Requests) ----
  const stub = (label: string, icon: React.ReactNode, msg: string) => (
    <EmptyState icon={icon} title={`${label} under construction`} message={msg} />
  );

  return (
    <>
      <BackButton />
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
            {showDelete && (
              <DeleteButton id={client.id} name={client.name} archived={archived} />
            )}
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: "details", label: "Details", content: detailsTab },
          { id: "properties", label: `Properties (${properties.length + rentedProperties.length})`, content: propertiesTab },
          { id: "notes", label: `Notes (${notes.length})`, content: notesTab },
          { id: "documents", label: "Documents", content: stub("Documents", <FileText className="h-6 w-6" />, "Multi-upload with filter by year. Schema ready; UI in upcoming rounds.") },
          { id: "requests", label: "Requests", content: stub("Requests", <Home className="h-6 w-6" />, "Linked tenant requests. Schema ready; UI in upcoming rounds.") },
        ]}
      />
    </>
  );
}
