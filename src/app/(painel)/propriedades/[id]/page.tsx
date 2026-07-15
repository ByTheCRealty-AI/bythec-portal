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
import { BulkDocumentImport } from "@/components/inline-forms/BulkDocumentImport";
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
  updateDocumentTenancyAction,
  importPropertyDocumentsAction,
  renameDocumentAction,
} from "../actions";
import { PaymentAddForm } from "../../payments/PaymentAddForm";
import { GeneratePaymentsButton } from "../../payments/GeneratePaymentsButton";
import { PropertyPaymentsTable } from "./PropertyPaymentsTable";
import { PastTenantPaymentsSection } from "./PastTenantPaymentsSection";
import { PastTenantDocumentsSection } from "./PastTenantDocumentsSection";
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
  setOwnerPaidAction,
  setOwnerPaymentMethodAction,
  setOwnerCheckNumberAction,
  addOwnerPayoutReceiptAction,
  deleteOwnerPayoutReceiptAction,
} from "../../payments/actions";
import {
  PROPERTY_TYPE_LABEL,
  RENT_COLLECTION_LABEL,
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
  const canEditProperty = can(profile, "properties.edit") || can(profile, "properties.own");
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
      .select(
        "id, parent_type, parent_id, file_url, file_name, content_type, year, category, tenant_id, tenant_label, doc_date, source_path, created_at, archived_at"
      )
      .eq("parent_type", "property")
      .eq("parent_id", p.id)
      .is("archived_at", null)
      // Newest on top, oldest at the bottom: by the document's real date (doc_date),
      // dateless ones last, then upload time. Grouping below preserves this order.
      .order("doc_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    // Pagamentos desta propriedade (não-arquivados). Mês desc nulls last, depois
    // criação desc — mesmo critério da tela /payments.
    supabase
      .from("payments")
      .select(
        "id, property_id, tenant_id, kind, month, due_date, rent_amount, commission, commission_paid, commission_paid_at, owner_paid, owner_paid_at, owner_payment_method, owner_check_number, status, received_at, amount_paid, notes, installment_no, installment_total, installment_group, archived_at, created_at, property:property_id (id, address, address2, property_type, rent_collection, owner:owner_id (id, name)), attachments:payment_attachments (id, file_url, file_name, content_type, payment_part_id, category), parts:payment_parts (id, payment_id, amount, paid_at, method, notes, created_at, attachments:payment_attachments (id, file_url, file_name, content_type, payment_part_id, category))"
      )
      .eq("property_id", p.id)
      .is("archived_at", null)
      .order("month", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    // Clientes (ativos + arquivados) — o TenancyForm usa só os ativos; o picker
    // de "past tenant" dos documentos busca ativos E arquivados (marca archived).
    supabase
      .from("clients")
      .select("id, name, archived_at")
      .order("name", { ascending: true }),
  ]);

  const notes = (notesData ?? []) as Note[];
  const services = (servicesData ?? []) as unknown as Service[];
  const requests = (requestsData ?? []) as unknown as TenantRequest[];
  const providers = (providersData ?? []) as { id: string; name: string }[];
  const documents = (documentsData ?? []) as Document[];
  const payments = (paymentsData ?? []) as unknown as Payment[];
  const allClients = (clientsData ?? []) as { id: string; name: string; archived_at: string | null }[];
  // TenancyForm picker stays active-only (you assign a live client as tenant).
  const clientOptions = allClients
    .filter((c) => c.archived_at === null)
    .map((c) => ({ id: c.id, name: c.name }));
  // Document "past tenant" picker searches active + archived, flagging archived.
  const tenantPickerOptions = allClients.map((c) => ({
    id: c.id,
    name: c.name,
    archived: c.archived_at !== null,
  }));
  const clientInfoById = new Map(tenantPickerOptions.map((c) => [c.id, c] as const));

  // Payments: só o inquilino ATUAL na lista principal; ex-inquilinos numa seção
  // colapsável ("current" = pagamento com tenant_id do inquilino atual). Vaga
  // (sem inquilino atual) = mostra tudo no principal (nada a separar).
  const currentTenantId = p.tenant?.id ?? null;
  const currentPayments = currentTenantId
    ? payments.filter((pay) => pay.tenant_id === currentTenantId)
    : payments;
  const pastPayments = currentTenantId
    ? payments.filter((pay) => pay.tenant_id !== currentTenantId)
    : [];

  // Nomes dos ex-inquilinos (inclui arquivados). tenant_id null -> grupo "earlier".
  const pastTenantIds = Array.from(
    new Set(pastPayments.map((pay) => pay.tenant_id).filter((id): id is string => Boolean(id)))
  );
  const pastNameById = new Map<string, string>();
  if (pastTenantIds.length > 0) {
    const { data: pastClients } = await supabase
      .from("clients")
      .select("id, name")
      .in("id", pastTenantIds);
    for (const c of (pastClients ?? []) as { id: string; name: string }[]) {
      pastNameById.set(c.id, c.name);
    }
  }

  const yearOf = (pay: Payment): number | null => {
    const d = pay.month ?? pay.due_date ?? pay.created_at ?? null;
    if (!d) return null;
    const y = Number(String(d).slice(0, 4));
    return Number.isFinite(y) ? y : null;
  };
  const pastGroupsMap = new Map<string, Payment[]>();
  for (const pay of pastPayments) {
    const key = pay.tenant_id ?? "__none__";
    const arr = pastGroupsMap.get(key);
    if (arr) arr.push(pay);
    else pastGroupsMap.set(key, [pay]);
  }
  const pastGroups = Array.from(pastGroupsMap.entries()).map(([key, items]) => {
    const years = items.map(yearOf).filter((y): y is number => y != null);
    const range =
      years.length === 0
        ? null
        : Math.min(...years) === Math.max(...years)
        ? String(Math.min(...years))
        : `${Math.min(...years)} – ${Math.max(...years)}`;
    return {
      key,
      name:
        key === "__none__"
          ? "Earlier (no tenant on record)"
          : pastNameById.get(key) ?? "Former tenant",
      range,
      payments: items,
    };
  });
  // Grupos mais recentes primeiro (maior ano no topo).
  pastGroups.sort(
    (a, b) =>
      Math.max(...b.payments.map((x) => yearOf(x) ?? 0)) -
      Math.max(...a.payments.map((x) => yearOf(x) ?? 0))
  );

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
          <div className="mt-3 border-t border-black/[0.06] pt-3">
            <Row
              label="Rent collection"
              value={RENT_COLLECTION_LABEL[p.rent_collection ?? "bythec"]}
            />
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
        <>
          {currentTenantId && (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-sm font-medium text-ink/80">Current tenant · {p.tenant?.name}</span>
            </div>
          )}
          {currentPayments.length > 0 ? (
            <PropertyPaymentsTable
              payments={currentPayments}
              canManage={canPayments}
              setStatus={setPaymentStatusAction}
              updateAction={updatePaymentAction}
              deleteAction={deletePaymentAction}
              addPartAction={addPaymentPartAction}
              updatePartAction={updatePaymentPartAction}
              deletePartAction={deletePaymentPartAction}
              ownerActions={{
                setOwnerPaid: setOwnerPaidAction,
                setOwnerMethod: setOwnerPaymentMethodAction,
                setOwnerCheckNumber: setOwnerCheckNumberAction,
                addReceipt: addOwnerPayoutReceiptAction,
                deleteReceipt: deleteOwnerPayoutReceiptAction,
              }}
            />
          ) : (
            <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-8 text-center text-sm text-ink/55 shadow-card">
              No payments for the current tenant yet.
            </div>
          )}
          {pastGroups.length > 0 && (
            <PastTenantPaymentsSection
              groups={pastGroups}
              canManage={canPayments}
              setStatus={setPaymentStatusAction}
              updateAction={updatePaymentAction}
              deleteAction={deletePaymentAction}
              addPartAction={addPaymentPartAction}
              updatePartAction={updatePaymentPartAction}
              deletePartAction={deletePaymentPartAction}
            />
          )}
        </>
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
      <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
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

  // "Belongs to" grouping: Current tenant -> Past tenant(s) -> Property docs.
  //  - current: tenant_id == current tenant (only when the property is occupied).
  //  - past:    tenant_id set but != current (grouped by client, archived flagged),
  //             PLUS free-text tenant_label groups (past tenants who aren't clients).
  //  - property: neither tenant_id nor tenant_label.
  // A vacant property has no "current" group, so tenant-linked docs fall to "past".
  const currentDocs = currentTenantId
    ? documents.filter((d) => d.tenant_id === currentTenantId)
    : [];
  const propertyDocs = documents.filter((d) => !d.tenant_id && !d.tenant_label);
  const pastGroupsDocMap = new Map<
    string,
    { key: string; name: string; archived: boolean; docs: Document[] }
  >();
  for (const d of documents) {
    let key: string | null = null;
    let name = "Former tenant";
    let archived = false;
    if (d.tenant_id && d.tenant_id !== currentTenantId) {
      key = `id:${d.tenant_id}`;
      const info = clientInfoById.get(d.tenant_id);
      name = info?.name ?? "Former tenant";
      archived = info?.archived ?? false;
    } else if (!d.tenant_id && d.tenant_label) {
      key = `label:${d.tenant_label}`;
      name = d.tenant_label;
    }
    if (!key) continue;
    const g = pastGroupsDocMap.get(key) ?? { key, name, archived, docs: [] };
    g.docs.push(d);
    pastGroupsDocMap.set(key, g);
  }
  const pastDocGroups = Array.from(pastGroupsDocMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const docList = (docs: Document[]) => (
    <ul className="space-y-3">
      {docs.map((d) => (
        <DocumentRow
          key={d.id}
          doc={d}
          canDelete={canUploadDocs}
          deleteAction={deletePropertyDocumentAction}
          canEditTenancy={canUploadDocs}
          currentTenant={p.tenant ? { id: p.tenant.id, name: p.tenant.name } : null}
          tenantOptions={tenantPickerOptions}
          updateTenancyAction={updateDocumentTenancyAction}
          canRename={canUploadDocs}
          renameAction={renameDocumentAction}
        />
      ))}
    </ul>
  );

  const documentsTab = (
    <div className="space-y-6">
      {canUploadDocs && (
        <div className="space-y-3">
          <DocumentAddForm
            parentType="property"
            parentId={p.id}
            action={addDocumentAction}
            currentTenant={p.tenant ? { id: p.tenant.id, name: p.tenant.name } : null}
            tenantOptions={tenantPickerOptions}
          />
          <BulkDocumentImport
            propertyId={p.id}
            currentTenant={p.tenant ? { id: p.tenant.id, name: p.tenant.name } : null}
            tenantOptions={tenantPickerOptions}
            action={importPropertyDocumentsAction}
          />
        </div>
      )}
      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No documents"
          message="Upload leases, inspections and other files for this property. Download anytime."
        />
      ) : (
        <div className="space-y-7">
          {currentDocs.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                <h3 className="text-sm font-semibold text-ink/80">
                  Current tenant · {p.tenant?.name}
                </h3>
                <span className="text-xs text-ink/45">{currentDocs.length}</span>
              </div>
              {docList(currentDocs)}
            </section>
          )}

          {propertyDocs.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-ink/40" />
                <h3 className="text-sm font-semibold text-ink/70">Property documents</h3>
                <span className="text-xs text-ink/45">{propertyDocs.length}</span>
              </div>
              {docList(propertyDocs)}
            </section>
          )}

          {/* Past tenants collapsed by default (mirrors the Payments tab). */}
          {pastDocGroups.length > 0 && (
            <PastTenantDocumentsSection
              groups={pastDocGroups}
              canDelete={canUploadDocs}
              deleteAction={deletePropertyDocumentAction}
              canEditTenancy={canUploadDocs}
              currentTenant={p.tenant ? { id: p.tenant.id, name: p.tenant.name } : null}
              tenantOptions={tenantPickerOptions}
              updateTenancyAction={updateDocumentTenancyAction}
              canRename={canUploadDocs}
              renameAction={renameDocumentAction}
            />
          )}
        </div>
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
