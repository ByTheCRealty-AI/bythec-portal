import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Badge, Card, buttonClass, EmptyState } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { PropriedadeArchiveButton } from "../PropriedadeArchiveButton";
import { PropriedadeDeleteButton } from "../PropriedadeDeleteButton";
import { BackButton } from "./BackButton";
import { getProfile } from "@/lib/auth/session";
import { canDelete, can } from "@/lib/auth/capabilities";
import { NoteAddForm } from "@/components/inline-forms/NoteAddForm";
import { ServiceAddForm } from "@/components/inline-forms/ServiceAddForm";
import { RequestAddForm } from "@/components/inline-forms/RequestAddForm";
import { DocumentAddForm } from "@/components/inline-forms/DocumentAddForm";
import { DocumentRow } from "@/components/inline-forms/DocumentRow";
import { NoteRow } from "@/components/inline-forms/NoteRow";
import { ServiceRow } from "@/components/inline-forms/ServiceRow";
import { RequestRow } from "@/components/inline-forms/RequestRow";
import {
  addPropertyNoteAction,
  addServiceAction,
  addRequestAction,
  addDocumentAction,
  updatePropertyNoteAction,
  deletePropertyNoteAction,
  updateServiceAction,
  deleteServiceAction,
  updateRequestAction,
  deleteRequestAction,
  deletePropertyDocumentAction,
} from "../actions";
import { PaymentAddForm } from "../../payments/PaymentAddForm";
import { GeneratePaymentsButton } from "../../payments/GeneratePaymentsButton";
import { PropertyPaymentsTable } from "./PropertyPaymentsTable";
import { TenancyForm } from "./TenancyForm";
import {
  addPaymentAction,
  addSecurityDepositAction,
  updatePaymentAction,
  deletePaymentAction,
  setPaymentStatusAction,
  addPaymentPartAction,
  updatePaymentPartAction,
  deletePaymentPartAction,
} from "../../payments/actions";
import {
  PROPERTY_TYPE_LABEL,
  type Property,
  type Note,
  type Service,
  type TenantRequest,
  type Document,
  type Payment,
} from "@/lib/types";
import { money, date } from "@/lib/format";
import { Pencil, User, StickyNote, Wrench, HardHat, FileText, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

type PropertyRow = Property & {
  owner: { id: string; name: string; email: string | null } | null;
  tenant: { id: string; name: string; email: string | null } | null;
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-black/[0.06] py-2.5 last:border-0">
      <span className="text-xs uppercase tracking-wider text-ink/45">{label}</span>
      <span className="text-sm text-ink/90">{value || "—"}</span>
    </div>
  );
}

export default async function PropriedadeDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("properties")
    .select("*, owner:owner_id (id, name, email), tenant:tenant_id (id, name, email)")
    .eq("id", params.id)
    .single();
  if (error || !data) notFound();
  const p = data as unknown as PropertyRow;
  const archived = p.archived_at !== null;
  const isRental = p.property_type === "year_round_rental" || p.property_type === "off_season_rental";

  // Owner-only: pode hard-delete (a UI só aparece pra owner; o banco reforça).
  const profile = await getProfile();
  const showDelete = canDelete(profile);

  // Gates dos forms inline (o RLS reforça no banco; aqui só guarda a UI).
  const canEditProperty = can(profile, "properties.edit");
  const canEditOps = can(profile, "operations.edit");
  // Mesmo gate da tela /payments: payments.annual OU financials.full. Controla os
  // botões de write da aba Payments (add/edit/delete/toggle). RLS reforça no banco.
  const canPayments = can(profile, "payments.annual") || can(profile, "financials.full");
  const today = new Date().toISOString().slice(0, 10);

  // Notes (polymorphic), services, tenant requests, providers ativos e payments.
  const [
    { data: notesData },
    { data: servicesData },
    { data: requestsData },
    { data: providersData },
    { data: documentsData },
    { data: paymentsData },
    { data: clientsData },
  ] = await Promise.all([
    supabase
      .from("notes")
      .select("id, body, year, created_at, updated_at, parent_type, parent_id")
      .eq("parent_type", "property")
      .eq("parent_id", p.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("services")
      .select(
        "id, service_request_date, description, status, price, created_at, provider:provider_id(id,name)"
      )
      .eq("property_id", p.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tenant_requests")
      .select("id, date, description, status, created_at")
      .eq("property_id", p.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("service_providers")
      .select("id, name")
      .is("archived_at", null) // TRAVADO: só providers ativos no dropdown
      .order("name", { ascending: true }),
    supabase
      .from("documents")
      .select("id, parent_type, parent_id, file_url, file_name, content_type, year, created_at, archived_at")
      .eq("parent_type", "property")
      .eq("parent_id", p.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    // Pagamentos desta propriedade (não-arquivados). Mês desc nulls last, depois
    // criação desc — mesmo critério da tela /payments.
    supabase
      .from("payments")
      .select(
        "id, property_id, tenant_id, kind, month, due_date, rent_amount, commission, status, received_at, amount_paid, notes, installment_no, installment_total, installment_group, archived_at, created_at, attachments:payment_attachments (id, file_url, file_name, content_type, payment_part_id), parts:payment_parts (id, payment_id, amount, paid_at, method, notes, created_at, attachments:payment_attachments (id, file_url, file_name, content_type, payment_part_id))"
      )
      .eq("property_id", p.id)
      .is("archived_at", null)
      .order("month", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    // Clientes ativos pro picker de inquilino (trocar/definir tenant).
    supabase
      .from("clients")
      .select("id, name")
      .is("archived_at", null)
      .order("name", { ascending: true }),
  ]);

  const notes = (notesData ?? []) as Note[];
  const services = (servicesData ?? []) as unknown as Service[];
  const requests = (requestsData ?? []) as unknown as TenantRequest[];
  const providers = (providersData ?? []) as { id: string; name: string }[];
  const documents = (documentsData ?? []) as Document[];
  const payments = (paymentsData ?? []) as unknown as Payment[];
  const clientOptions = (clientsData ?? []) as { id: string; name: string }[];

  // ---- Aba Overview (Details / Owner / Rent / short Notes summary) ----
  const overviewTab = (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="h-display text-sm text-ink/70">Details</h3>
          <Badge tone="orange">{PROPERTY_TYPE_LABEL[p.property_type]}</Badge>
        </div>
        <Row label="Address" value={p.address} />
        <Row label="Unit / apt" value={p.address2} />
        <Row label="Commission" value={p.commission_fee} />
      </Card>

      <Card>
        <h3 className="h-display mb-3 text-sm text-ink/70">Owner</h3>
        {p.owner ? (
          <Link
            href={`/clientes/${p.owner.id}`}
            className="flex items-center gap-3 rounded-xl border border-black/[0.10] bg-black/[0.015] p-3 transition hover:border-primary/40 hover:bg-primary/[0.04]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <User className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">{p.owner.name}</span>
              <span className="block text-xs text-ink/50">{p.owner.email ?? "—"}</span>
            </span>
          </Link>
        ) : (
          <p className="text-sm text-ink/50">No owner.</p>
        )}
      </Card>

      {isRental && (
        <Card>
          <h3 className="h-display mb-3 text-sm text-ink/70">Tenant</h3>
          {p.tenant ? (
            <Link
              href={`/clientes/${p.tenant.id}`}
              className="flex items-center gap-3 rounded-xl border border-black/[0.10] bg-black/[0.015] p-3 transition hover:border-primary/40 hover:bg-primary/[0.04]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <User className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{p.tenant.name}</span>
                <span className="block text-xs text-ink/50">{p.tenant.email ?? "—"}</span>
              </span>
            </Link>
          ) : (
            <p className="text-sm text-ink/50">No tenant (vacant).</p>
          )}
          {canEditProperty && (
            <TenancyForm
              propertyId={p.id}
              currentTenant={p.tenant ? { id: p.tenant.id, name: p.tenant.name } : null}
              clients={clientOptions}
              lease={{
                rentPrice: p.rent_price,
                rentDueDay: p.rent_due_day,
                rentalStart: p.rental_start,
                rentalEnd: p.rental_end,
              }}
            />
          )}
        </Card>
      )}

      {isRental && (
        <Card className="md:col-span-2">
          <h3 className="h-display mb-3 text-sm text-ink/70">Rent</h3>
          <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-4">
            <Row label="Monthly" value={money(p.rent_price)} />
            <Row label="Due" value={p.rent_due_day ? `Day ${p.rent_due_day}` : null} />
            <Row label="Start" value={date(p.rental_start)} />
            <Row label="End" value={date(p.rental_end)} />
          </div>
        </Card>
      )}

      {p.notes && (
        <Card className="md:col-span-2">
          <h3 className="h-display mb-2 text-sm text-ink/70">Notes</h3>
          <p className="whitespace-pre-wrap text-sm text-ink/80">{p.notes}</p>
        </Card>
      )}
    </div>
  );

  // ---- Aba Payments (histórico de aluguel desta propriedade + add inline) ----
  // Propriedade FIXA: o add não tem picker; tenant + valor preenchem sozinhos no
  // servidor / a partir do rent. Write gated por canPayments; senão, read-only.
  const paymentsTab = (
    <div className="space-y-5">
      {canPayments && (
        <PaymentAddForm
          action={addPaymentAction}
          depositAction={addSecurityDepositAction}
          fixedProperty={{ id: p.id, rent_price: p.rent_price }}
        />
      )}
      {canPayments && (
        <GeneratePaymentsButton
          propertyId={p.id}
          rentPrice={p.rent_price}
          rentalStart={p.rental_start}
          rentalEnd={p.rental_end}
          rentDueDay={p.rent_due_day}
          existingMonths={payments
            .filter((pay) => pay.kind === "monthly" && pay.month)
            .map((pay) => pay.month as string)}
        />
      )}
      {payments.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="No payments"
          message={
            canPayments
              ? "Record a rent payment for this property. Tenant and amount fill in automatically."
              : "Rent payments for this property will appear here, newest first."
          }
        />
      ) : (
        <PropertyPaymentsTable
          payments={payments}
          canManage={canPayments}
          setStatus={setPaymentStatusAction}
          updateAction={updatePaymentAction}
          deleteAction={deletePaymentAction}
          addPartAction={addPaymentPartAction}
          updatePartAction={updatePaymentPartAction}
          deletePartAction={deletePaymentPartAction}
        />
      )}
    </div>
  );

  // ---- Aba Notes (timeline polimórfica + add inline) ----
  const notesTab = (
    <div className="space-y-5">
      {canEditProperty && (
        <NoteAddForm parentType="property" parentId={p.id} action={addPropertyNoteAction} />
      )}
      {notes.length === 0 ? (
        <EmptyState
          icon={<StickyNote className="h-6 w-6" />}
          title="No notes"
          message="Notes attached to this property appear here, newest first."
        />
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              parentId={p.id}
              canEdit={canEditProperty}
              updateAction={updatePropertyNoteAction}
              deleteAction={deletePropertyNoteAction}
            />
          ))}
        </ul>
      )}
    </div>
  );

  // ---- Aba Services (histórico + add inline) ----
  const servicesList =
    services.length === 0 ? (
      <EmptyState
        icon={<HardHat className="h-6 w-6" />}
        title="No services"
        message="Services recorded for this property appear here, newest first."
      />
    ) : (
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3 font-bold">Date</th>
              <th className="px-4 py-3 font-bold">Description</th>
              <th className="px-4 py-3 font-bold">Provider</th>
              <th className="px-4 py-3 font-bold text-right">Price</th>
              <th className="px-4 py-3 font-bold">Status</th>
              {canEditOps && <th className="px-4 py-3 text-right font-bold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {services.map((s, i) => (
              <ServiceRow
                key={s.id}
                service={s}
                propertyId={p.id}
                providers={providers}
                canEdit={canEditOps}
                zebra={i % 2 === 1}
                updateAction={updateServiceAction}
                deleteAction={deleteServiceAction}
              />
            ))}
          </tbody>
        </table>
      </div>
    );

  const servicesTab = (
    <div className="space-y-5">
      {canEditOps && (
        <ServiceAddForm
          propertyId={p.id}
          providers={providers}
          action={addServiceAction}
          today={today}
        />
      )}
      {servicesList}
    </div>
  );

  // ---- Aba Requests (tenant requests + add inline) ----
  const requestsList =
    requests.length === 0 ? (
      <EmptyState
        icon={<Wrench className="h-6 w-6" />}
        title="No tenant requests"
        message="Maintenance and tenant requests linked to this property appear here."
      />
    ) : (
      <ul className="divide-y divide-black/[0.06] rounded-2xl border border-black/[0.08] bg-white px-5 shadow-card">
        {requests.map((r) => (
          <RequestRow
            key={r.id}
            request={r}
            propertyId={p.id}
            canEdit={canEditOps}
            updateAction={updateRequestAction}
            deleteAction={deleteRequestAction}
          />
        ))}
      </ul>
    );

  const requestsTab = (
    <div className="space-y-5">
      {canEditOps && (
        <RequestAddForm
          propertyId={p.id}
          tenantId={p.tenant?.id ?? null}
          tenantName={p.tenant?.name ?? null}
          action={addRequestAction}
          today={today}
        />
      )}
      {requestsList}
    </div>
  );

  // ---- Aba Documents (upload no browser + lista + download via signed URL) ----
  // Gate: properties.edit OU operations.edit (RLS reforça no banco).
  const canUploadDocs = canEditProperty || canEditOps;
  const documentsTab = (
    <div className="space-y-5">
      {canUploadDocs && (
        <DocumentAddForm parentType="property" parentId={p.id} action={addDocumentAction} />
      )}
      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No documents"
          message="Upload leases, inspections and other files for this property. Download anytime."
        />
      ) : (
        <ul className="space-y-3">
          {documents.map((d) => (
            <DocumentRow
              key={d.id}
              doc={d}
              canDelete={canUploadDocs}
              deleteAction={deletePropertyDocumentAction}
            />
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <BackButton />
      <PageHeader
        title={p.address}
        subtitle={p.address2 ?? PROPERTY_TYPE_LABEL[p.property_type]}
        action={
          <div className="flex items-center gap-3">
            {archived && <Badge tone="muted">Archived</Badge>}
            <Link href={`/propriedades/${p.id}/editar`} className={buttonClass("ghost")}>
              <Pencil className="h-4 w-4" /> Edit
            </Link>
            <PropriedadeArchiveButton id={p.id} archived={archived} />
            {showDelete && (
              <PropriedadeDeleteButton id={p.id} address={p.address} archived={archived} />
            )}
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: "overview", label: "Overview", content: overviewTab },
          { id: "payments", label: `Payments (${payments.length})`, content: paymentsTab },
          { id: "notes", label: `Notes (${notes.length})`, content: notesTab },
          { id: "services", label: `Services (${services.length})`, content: servicesTab },
          { id: "requests", label: `Requests (${requests.length})`, content: requestsTab },
          { id: "documents", label: `Documents (${documents.length})`, content: documentsTab },
        ]}
      />
    </>
  );
}
