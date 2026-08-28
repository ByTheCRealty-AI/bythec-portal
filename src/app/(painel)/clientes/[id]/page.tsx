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
import { canDelete, can } from "@/lib/auth/capabilities";
import { NonFacilitatorEditor } from "@/components/NonFacilitatorEditor";
import { NoteAddForm } from "@/components/inline-forms/NoteAddForm";
import { DocumentAddForm } from "@/components/inline-forms/DocumentAddForm";
import { DocumentRow } from "@/components/inline-forms/DocumentRow";
import { NoteRow } from "@/components/inline-forms/NoteRow";
import {
  addClientNoteAction,
  addDocumentAction,
  updateClientNoteAction,
  deleteClientNoteAction,
  deleteClientDocumentAction,
} from "../actions";
import {
  clientRoleLabels,
  propertyTypeLabels,
  DEAL_SIDE_LABEL,
  DEAL_STATUS_LABEL,
  type Client,
  type Property,
  type Note,
  type Document,
} from "@/lib/types";
import { InlineDateEditor } from "@/components/InlineDateEditor";
import { setDealClosedDateAction } from "@/app/(painel)/sales/actions";
import { money, date } from "@/lib/format";
import { operatorNameMap, withCreatorNames } from "@/lib/operators";
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
    .select("id, body, year, created_at, updated_at, parent_type, parent_id, created_by")
    .eq("parent_type", "client")
    .eq("parent_id", client.id)
    .order("created_at", { ascending: false });
  const notes = withCreatorNames((notesData ?? []) as Note[], await operatorNameMap(supabase));

  // Documents (polymorphic) attached to this client.
  const { data: documentsData } = await supabase
    .from("documents")
    .select("id, parent_type, parent_id, file_url, file_name, content_type, year, created_at, archived_at")
    .eq("parent_type", "client")
    .eq("parent_id", client.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  const documents = (documentsData ?? []) as Document[];

  // Invoices geradas pra este cliente (mais recentes primeiro).
  const { data: invoicesData } = await supabase
    .from("invoices")
    .select("id, invoice_number, kind, date, paid, total_received_by_owner, labor_total, material_total")
    .eq("client_id", client.id)
    .order("date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  const invoices = (invoicesData ?? []) as {
    id: string;
    invoice_number: string | null;
    kind: string;
    date: string | null;
    paid: boolean | null;
    total_received_by_owner: number | null;
    labor_total: number | null;
    material_total: number | null;
  }[];

  const archived = client.archived_at !== null;

  // Owner-only: pode hard-delete (a UI só aparece pra owner; o banco reforça).
  const profile = await getProfile();
  const showDelete = canDelete(profile);
  // .own = realtor (RLS só deixa abrir os dele); .edit = internos.
  const canEditClient = can(profile, "clients.edit") || can(profile, "clients.own");
  const canEditOps = can(profile, "operations.edit");

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
        <Row label="Type" value={clientRoleLabels(client).join(" · ")} />
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
      {client.is_buyer_seller && (
        <Card>
          <h3 className="h-display mb-3 text-sm text-ink/70">Deal</h3>
          <Row label="Side" value={client.deal_side ? DEAL_SIDE_LABEL[client.deal_side] : null} />
          <Row
            label="Status"
            value={client.deal_status ? DEAL_STATUS_LABEL[client.deal_status] : "Active"}
          />
          <Row
            label="Closing date"
            value={
              client.deal_status && client.deal_status !== "active" ? (
                <InlineDateEditor
                  action={setDealClosedDateAction}
                  id={client.id}
                  initial={client.deal_closed_at}
                  canEdit={can(profile, "clients.edit")}
                />
              ) : (
                <span className="text-sm text-ink/45">
                  Open — close the deal in Sales to set a date
                </span>
              )
            }
          />
        </Card>
      )}
      {client.notes && (
        <Card className="md:col-span-2">
          <h3 className="h-display mb-2 text-sm text-ink/70">Notes</h3>
          <p className="whitespace-pre-wrap text-sm text-ink/80">{client.notes}</p>
        </Card>
      )}
    </div>
  );

  // Serviço não-facilitador editável na página do cliente também (fonte = property).
  const canEditProp = can(profile, "properties.edit") || can(profile, "properties.own");
  // Card de propriedade reutilizado nos grupos "Owns" e "Renting". showService =
  // mostra o editor de serviço não-facilitador (só no "Owns", tipos elegíveis).
  const propertyCard = (p: Property, showService = false) => (
    <Card key={p.id} className="glass-hover">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{p.address}</p>
          {p.address2 && <p className="text-xs text-ink/45">{p.address2}</p>}
        </div>
        {propertyTypeLabels(p).map((label) => (
          <Badge key={label} tone="orange">
            {label}
          </Badge>
        ))}
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
      {showService && (p.is_for_sale || p.is_year_round || p.is_winter) && (
        <div className="mt-4">
          <NonFacilitatorEditor
            propertyId={p.id}
            canEdit={canEditProp}
            initialOn={p.non_facilitator}
            initialType={p.nf_fee_type}
            initialValue={p.nf_fee_value}
            landlord={!!(p.is_year_round || p.is_winter)}
          />
        </div>
      )}
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
                {properties.map((p) => propertyCard(p, true))}
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

  // ---- Aba Notes (timeline polimórfica + add inline) ----
  const notesTab = (
    <div className="space-y-5">
      {canEditClient && (
        <NoteAddForm parentType="client" parentId={client.id} action={addClientNoteAction} />
      )}
      {notes.length === 0 ? (
        <EmptyState
          icon={<StickyNote className="h-6 w-6" />}
          title="No notes"
          message="Notes attached to this client appear here, newest first."
        />
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              parentId={client.id}
              canEdit={canEditClient}
              updateAction={updateClientNoteAction}
              deleteAction={deleteClientNoteAction}
            />
          ))}
        </ul>
      )}
    </div>
  );

  // ---- Aba Documents (upload no browser + lista + download via signed URL) ----
  // Gate: clients.edit OU operations.edit (RLS reforça no banco).
  const canUploadDocs = canEditClient || canEditOps;
  const documentsTab = (
    <div className="space-y-5">
      {canUploadDocs && (
        <DocumentAddForm parentType="client" parentId={client.id} action={addDocumentAction} />
      )}
      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No documents"
          message="Upload contracts, IDs and other files for this client. Download anytime."
        />
      ) : (
        <ul className="space-y-3">
          {documents.map((d) => (
            <DocumentRow
              key={d.id}
              doc={d}
              canDelete={canUploadDocs}
              deleteAction={deleteClientDocumentAction}
            />
          ))}
        </ul>
      )}
    </div>
  );

  // ---- Aba Invoices (faturas geradas pra este cliente) ----
  // "To owner" = o que o dono recebe. Seasonal usa total_received_by_owner;
  // service (labor+material) não tem payout de dono, cai no total do serviço.
  const invoiceTotal = (inv: (typeof invoices)[number]) =>
    inv.kind === "seasonal"
      ? inv.total_received_by_owner ?? 0
      : (inv.labor_total ?? 0) + (inv.material_total ?? 0);

  const invoicesTab =
    invoices.length === 0 ? (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="No invoices yet"
        message="Invoices created for this client appear here, newest first."
      />
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/[0.08] text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="py-2 font-bold">Invoice</th>
              <th className="py-2 font-bold">Type</th>
              <th className="py-2 font-bold">Date</th>
              <th className="py-2 text-right font-bold">To owner</th>
              <th className="py-2 text-right font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-black/[0.05] hover:bg-black/[0.015]">
                <td className="py-2.5">
                  <Link href={`/invoices/${inv.id}`} className="font-medium text-primary hover:underline">
                    #{inv.invoice_number ?? "—"}
                  </Link>
                </td>
                <td className="py-2.5 capitalize text-ink/75">{inv.kind}</td>
                <td className="py-2.5 text-ink/75">{date(inv.date)}</td>
                <td className="py-2.5 text-right text-ink/85">{money(invoiceTotal(inv))}</td>
                <td className="py-2.5 text-right">
                  <Badge tone={inv.paid ? "blue" : "neutral"}>{inv.paid ? "Paid" : "Unpaid"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  // ---- Aba stub (Requests) ----
  const stub = (label: string, icon: React.ReactNode, msg: string) => (
    <EmptyState icon={icon} title={`${label} under construction`} message={msg} />
  );

  return (
    <>
      <BackButton />
      <PageHeader
        title={client.name}
        subtitle={clientRoleLabels(client).join(" · ")}
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
          { id: "invoices", label: `Invoices (${invoices.length})`, content: invoicesTab },
          { id: "documents", label: `Documents (${documents.length})`, content: documentsTab },
          { id: "requests", label: "Requests", content: stub("Requests", <Home className="h-6 w-6" />, "Linked tenant requests. Schema ready; UI in upcoming rounds.") },
        ]}
      />
    </>
  );
}
