// Tipos do domínio By the C. Espelham as migrations em supabase/migrations.
// Mantidos à mão nesta rodada; futuramente gerar via `supabase gen types typescript`.

// Base do % da comissão seasonal (single source of truth na fórmula travada).
export type { SeasonalCommissionBase } from "./invoice-formula";
import type { SeasonalCommissionBase } from "./invoice-formula";
import type { ProfileLike } from "./auth/capabilities";

export type ClientType =
  | "tenant"
  | "airbnb_owner"
  | "landlord"
  | "buy_sell_client"
  | "off_season_tenant";

export type PropertyType =
  | "year_round_rental"
  | "vacation_rental"
  | "off_season_rental"
  | "for_sale";

// Quem coleta o aluguel num year-round/off-season. Rastreio de rent + comissão é
// o mesmo nos dois; muda a DIREÇÃO do dinheiro e o label da comissão.
export type RentCollection = "bythec" | "owner";
export const RENT_COLLECTION_LABEL: Record<RentCollection, string> = {
  bythec: "By the C collects (I pay the owner)",
  owner: "Owner collects (they remit my commission)",
};

export type DealSide = "buyer" | "seller" | "both";

// =============================================================================
// Sales (brokerage side) — realtors, buyer/seller stages, listing status.
// Mirrors the live DB: `realtors` table + clients.realtor_id/sales_stage and
// properties.realtor_id/sale_status (added directly in the DB, no migration file).
// =============================================================================

export interface Realtor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  profile_id: string | null;
  active: boolean;
  created_at: string;
}

// Stage options are stored as free text in the DB (clients.sales_stage). We keep
// the canonical lists + labels here so the UI dropdowns stay consistent.
export type BuyerStage =
  | "searching"
  | "pre_approved"
  | "offer_made"
  | "under_contract"
  | "closed";

export type SellerStage =
  | "prepping"
  | "listed"
  | "under_contract"
  | "sold";

export const BUYER_STAGE_LABEL: Record<BuyerStage, string> = {
  searching: "Searching",
  pre_approved: "Pre-approved",
  offer_made: "Offer made",
  under_contract: "Under contract",
  closed: "Closed",
};

export const SELLER_STAGE_LABEL: Record<SellerStage, string> = {
  prepping: "Prepping",
  listed: "Listed",
  under_contract: "Under contract",
  sold: "Sold",
};

// Friendly label for ANY stored stage value (buyer or seller), with a graceful
// fallback that humanizes unknown values instead of showing a raw enum string.
export function stageLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const all: Record<string, string> = { ...BUYER_STAGE_LABEL, ...SELLER_STAGE_LABEL };
  return all[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type SaleStatus = "active" | "pending" | "sold" | "expired";

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  active: "Active",
  pending: "Under contract",
  sold: "Sold",
  expired: "Expired",
};

// Deal outcome on a buy/sell client. Mirrors clients.deal_status check
// constraint (active | closed | expired). active = live board; closed = won
// (bought / home sold); expired = no deal (fell through / contract ended).
export type DealStatus = "active" | "closed" | "expired";

export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  active: "Active",
  closed: "Closed",
  expired: "Expired",
};

export interface Client {
  id: string;
  name: string;
  client_type: ClientType;
  deal_side: DealSide | null;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  notes: string | null;
  billing_address: string | null;
  billing_address2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  co_client_name: string | null;
  co_client_email: string | null;
  co_client_phone: string | null;
  email_notifications: boolean;
  sms_notifications: boolean;
  active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // Sales (brokerage) — only set on buy/sell clients.
  realtor_id: string | null;
  sales_stage: string | null;
  // Deal lifecycle. active = on the live board; closed/expired = history
  // (shown in "Sold & Closed", not on the active board). deal_closed_at is
  // stamped when the deal leaves active and cleared when reopened.
  deal_status: DealStatus | null;
  deal_closed_at: string | null;
}

export interface Property {
  id: string;
  owner_id: string;
  address: string;
  address2: string | null;
  address_text: string | null;
  property_type: PropertyType;
  commission_fee: number | null;
  // By the C seasonal commission rate (fraction, default 0.10). Editável por invoice.
  seasonal_commission_rate: number;
  // Base do % da comissão seasonal POR PROPERTY: 'host_payout' (maioria) ou
  // 'paid_by_guest' (ex.: Rainbow). Default 'host_payout'. Editável por invoice.
  seasonal_commission_base: SeasonalCommissionBase;
  tenant_id: string | null;
  rent_price: number | null;
  rental_start: string | null;
  rental_end: string | null;
  rent_due_day: number | null;
  rent_frequency: string | null;
  // Quem coleta o aluguel (year-round/off-season). 'bythec' = By the C coleta e
  // paga o owner (menos comissão); 'owner' = owner coleta e remete a comissão.
  rent_collection: RentCollection;
  notes: string | null;
  photo_url: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // Sales (brokerage) — only meaningful on for_sale properties.
  realtor_id: string | null;
  sale_status: string | null;
  // join opcional
  owner?: Pick<Client, "id" | "name" | "email"> | null;
}

// Display labels (UI). Single source of truth for display.
export const CLIENT_TYPE_LABEL: Record<ClientType, string> = {
  tenant: "Tenant",
  airbnb_owner: "Airbnb Owner",
  landlord: "Landlord",
  buy_sell_client: "Buyer / Seller",
  off_season_tenant: "Off-Season Tenant",
};

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  year_round_rental: "Year-Round Rental",
  vacation_rental: "Vacation Rental",
  off_season_rental: "Off-Season Rental",
  for_sale: "For Sale",
};

export const DEAL_SIDE_LABEL: Record<DealSide, string> = {
  buyer: "Buyer",
  seller: "Seller",
  both: "Buyer and seller",
};

// =============================================================================
// Invoices — espelham supabase/migrations 0002_finance.sql + 0008.
// Dois tipos: SERVICE (manutenção/long-term) e SEASONAL (Airbnb/VRBO).
// Fórmula seasonal TRAVADA — ver docs/invoice-formats.md.
// =============================================================================

export type InvoiceKind = "seasonal" | "service";
export type InvoiceItemType = "charge" | "discount" | "fee";
export type CleaningDestination = "owner" | "bythec";
export type InvoiceItemCategory = "labor" | "material";

export interface Invoice {
  id: string;
  invoice_number: number;
  client_id: string;
  property_id: string | null;
  kind: InvoiceKind;
  platform: string | null; // 'Airbnb' | 'VRBO' (seasonal)

  date: string;
  due_date: string | null;
  dates_reserved_start: string | null;
  dates_reserved_end: string | null;
  paid_date: string | null;
  paid: boolean;

  guest_name: string | null;
  notes: string | null;
  pdf_url: string | null;

  // ---- SEASONAL (Airbnb/VRBO) — guarda o resultado da fórmula travada.
  room_fee: number | null;
  rental_nights: number | null;
  cleaning_fee: number | null;
  guest_service_fee: number | null;
  host_service_fee: number | null;
  host_payout: number | null;
  occupancy_taxes: number | null;
  lodging_taxes_vrbo: number | null;
  rental_discount: number | null;
  total_paid_by_guest: number | null;
  bythec_commission: number | null;
  // Auditoria do que foi usado no cálculo da comissão (travado no invoice).
  commission_base: SeasonalCommissionBase | null;
  commission_rate: number | null;
  total_received_by_owner: number | null;
  cleaning_goes_to: CleaningDestination | null;
  // Interno: quando cleaning_goes_to = 'bythec', a By the C paga o cleaner.
  // Toggle manual na tela (não vai pro PDF). Espelha payments.commission_paid.
  cleaner_paid: boolean;
  cleaner_paid_at: string | null;
  // Como a By the C pagou owner e cleaner (interno). "owner pago" = flag `paid`.
  owner_payment_method: string | null;
  cleaner_payment_method: string | null;
  // Nº do cheque (só relevante quando o método é Check/eCheck).
  owner_check_number: string | null;
  cleaner_check_number: string | null;
  vrbo_commission: number | null;
  vrbo_payment_fee: number | null;
  vrbo_property_damage: number | null;

  // ---- SERVICE (long-term/manutenção). Labor + Material = Total.
  labor_total: number | null;
  material_total: number | null;
  service_address: string | null; // endereço digitado quando não há property_id

  archived_at: string | null;
  created_at: string;
  updated_at: string;

  // joins opcionais
  client?: Pick<Client, "id" | "name" | "email" | "phone" | "billing_address" | "billing_address2" | "billing_city" | "billing_state" | "billing_zip"> | null;
  property?: Pick<Property, "id" | "address" | "address2" | "seasonal_commission_rate" | "seasonal_commission_base"> | null;
  items?: InvoiceItem[];
  attachments?: InvoiceAttachment[] | null;
}

// Anexos (recibos Airbnb/VRBO/Stripe…) de uma invoice. file_url é object path no
// bucket privado `documents`. Entram no PDF combinado (invoice + recibos).
export type InvoiceAttachmentCategory = "guest_receipt" | "owner_payout" | "cleaner_payout";

export interface InvoiceAttachment {
  id: string;
  invoice_id: string;
  file_url: string;
  file_name: string | null;
  content_type: string | null;
  // guest_receipt = entra no PDF combinado; owner_payout/cleaner_payout = interno.
  category: InvoiceAttachmentCategory;
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  total: number; // sinal livre; semântica vem de type
  type: InvoiceItemType;
  guest: boolean; // aparece no overview do guest (seasonal)
  owner: boolean; // aparece no overview do owner (seasonal)
  category: InvoiceItemCategory | null; // 'labor' | 'material' (service)
  created_at: string;
}

export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  seasonal: "Seasonal",
  service: "Service",
};

export const INVOICE_ITEM_CATEGORY_LABEL: Record<InvoiceItemCategory, string> = {
  labor: "Labor",
  material: "Material",
};

export const CLEANING_DESTINATION_LABEL: Record<CleaningDestination, string> = {
  owner: "Owner keeps cleaning fee",
  bythec: "By the C keeps cleaning fee",
};

export const SEASONAL_COMMISSION_BASE_LABEL: Record<SeasonalCommissionBase, string> = {
  host_payout: "Host payout",
  paid_by_guest: "Total paid by guest",
};

export const INVOICE_PLATFORMS = ["Airbnb", "VRBO"] as const;

// =============================================================================
// Operations — Service providers, tenant requests, services, notes.
// Read-only screens for now (Wave 2 / Phase 1-2). Mirror the live DB schema.
// =============================================================================

export type NotifyVia = "whatsapp" | "email";

export interface ServiceProvider {
  id: string;
  name: string; // business name
  service_type: string | null;
  phone: string | null; // office number
  email: string | null;
  notify_via: NotifyVia | null;
  notes: string | null;
  // Point of contact (pessoa preferida) + o número dela.
  contact_person: string | null;
  contact_phone: string | null;
  // Provider preferido (starred).
  preferred: boolean;
  archived_at: string | null;
  created_at: string;
}

// Lista canônica de tipos de serviço (dropdown). É texto no banco; ao editar um
// provider cujo valor não esteja aqui, a UI adiciona a opção dinamicamente.
export const SERVICE_TYPE_OPTIONS: string[] = [
  "HVAC",
  "Plumbing",
  "Electrical",
  "Painting",
  "Landscaping / Lawn",
  "Cleaning",
  "Roofing",
  "Carpentry / Handyman",
  "General Contractor",
  "Pest Control",
  "Appliance Repair",
  "Flooring",
  "Pool / Spa",
  "Snow Removal",
  "Locksmith",
  "Masonry",
  "Windows / Doors",
  "Gutters",
  "Septic",
  "Other",
];

export type RequestStatus = "open" | "done";

export interface TenantRequest {
  id: string;
  property_id: string;
  tenant_id: string | null;
  date: string | null;
  description: string | null;
  status: RequestStatus;
  done_at: string | null;
  created_at: string;
  // joins opcionais
  property?: Pick<Property, "id" | "address"> | null;
  tenant?: Pick<Client, "id" | "name"> | null;
}

export interface Service {
  id: string;
  property_id: string;
  provider_id: string | null;
  tenant_request_id: string | null;
  service_request_date: string | null;
  description: string | null;
  status: RequestStatus;
  done_at: string | null;
  price: number | null;
  created_at: string;
  // join opcional
  provider?: Pick<ServiceProvider, "id" | "name"> | null;
}

export type NoteParentType = "client" | "property" | "listing";

export interface Note {
  id: string;
  parent_type: NoteParentType;
  parent_id: string;
  body: string | null;
  year: number | null;
  created_at: string;
  updated_at: string;
}

// Documents (polymorphic). file_url stores the STORAGE OBJECT PATH (bucket is
// private), never a public URL — downloads use a short-lived signed URL.
export type DocumentParentType = "client" | "property" | "listing";

export interface Document {
  id: string;
  parent_type: DocumentParentType;
  parent_id: string;
  file_url: string; // storage object path inside bucket `documents`
  file_name: string;
  content_type: string | null;
  year: number | null;
  // Property-scoped organization (migration 0020). `category` = doc-type tag
  // (column ready; UI deferred per Andrea 2026-07-13). "Belongs to" = who the
  // doc is about: tenant_id links a (possibly ARCHIVED) client; tenant_label
  // holds a free-text past-tenant name when they aren't a client. Both null =
  // the property itself. Only tenant_id OR tenant_label is set, never both.
  category: string | null;
  tenant_id: string | null;
  tenant_label: string | null;
  // migration 0023 — import + ordering. doc_date = the document's REAL date (source file's
  // modified time); orders newest-first within a group. source_path = original OneDrive path
  // (provenance + import idempotency). Both null for manually-uploaded docs.
  doc_date: string | null;
  source_path: string | null;
  created_at: string;
  archived_at: string | null;
}

// "Belongs to" selector value on the property Documents tab. Resolved to
// tenant_id / tenant_label on the server (current tenant is never trusted from
// the client — it's looked up from the property).
export type DocumentBelongsTo = "property" | "current" | "past_existing" | "past_free";

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  open: "Open",
  done: "Done",
};

// =============================================================================
// Payments — aluguel year-round / off-season. REGIME DE CAIXA (due -> received).
// Espelha a tabela `payments` na DB live (0002_finance + coluna `kind`).
// =============================================================================

export type PaymentStatus = "due" | "received";
export type PaymentKind =
  | "monthly"
  | "first_month"
  | "last_month"
  | "security_deposit";

// Receipt files tied to a payment (one or more). IMPORTANT: file_url is EITHER a
// full external URL (legacy Bubble-imported receipts start with "http") OR a
// Supabase storage object path inside the `documents` bucket (future uploads).
// The viewer branches on `file_url.startsWith("http")` — see PaymentReceipt.tsx.
export type PaymentAttachmentCategory = "rent_receipt" | "owner_payout";

export interface PaymentAttachment {
  id: string;
  file_url: string;
  file_name: string | null;
  content_type: string | null;
  // Set when the receipt belongs to a specific partial payment (payment_parts).
  // Null = payment-level receipt (legacy Bubble import + single full-payment add).
  payment_part_id?: string | null;
  // rent_receipt = tenant proof (Receipt column); owner_payout = owner-payout proof.
  // Optional in the type because some older selects may not request it.
  category?: PaymentAttachmentCategory | null;
}

// One partial payment a tenant made toward a rent charge. A rent payment can be
// settled in several of these; the parent flips to received only when they sum
// to rent_amount (cash basis — commission counts then). Each part can carry its
// own receipts (any media), including cash (a photo of the paper receipt).
export interface PaymentPart {
  id: string;
  payment_id: string;
  amount: number;
  paid_at: string; // YYYY-MM-DD
  method: string | null;
  notes: string | null;
  created_at: string;
  attachments?: PaymentAttachment[] | null;
}

export interface Payment {
  id: string;
  property_id: string;
  tenant_id: string | null;
  kind: PaymentKind;
  month: string | null; // mês de competência (1º dia do mês)
  due_date: string | null;
  rent_amount: number | null;
  commission: number | null;
  // Manual flag: By the C's commission for this payment has been paid/settled.
  commission_paid: boolean;
  commission_paid_at: string | null;
  // Owner payout (only meaningful when property.rent_collection = 'bythec' and the
  // payment is received). By the C owes the owner ≈ rent_amount − commission.
  owner_paid: boolean;
  owner_paid_at: string | null;
  owner_payment_method: string | null; // eCheck | Zelle | Cash | Other (free text)
  owner_check_number: string | null; // only when method = eCheck
  status: PaymentStatus;
  received_at: string | null;
  // Running sum of partial payments (payment_parts). Derived display state:
  // status='due' AND amount_paid>0 => "Partial". Maintained by the server actions.
  amount_paid: number | null;
  notes: string | null;
  // Security-deposit installment tracking. A single deposit is split into N
  // monthly installments that share one `installment_group` UUID. Null on all
  // single payments (monthly / first_month / last_month) and on legacy
  // single-row deposits imported before the split feature.
  installment_no: number | null;
  installment_total: number | null;
  installment_group: string | null;
  archived_at: string | null;
  created_at: string;
  // joins opcionais
  property?:
    | (Pick<Property, "id" | "address" | "address2" | "property_type" | "rent_collection"> & {
        owner?: Pick<Client, "id" | "name"> | null;
      })
    | null;
  tenant?: Pick<Client, "id" | "name"> | null;
  // Imported receipts (one per payment for the Bubble batch). May be empty.
  attachments?: PaymentAttachment[] | null;
  // Partial payments logged against this rent (monthly / first/last month).
  parts?: PaymentPart[] | null;
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  due: "Due",
  received: "Received",
};

// Payment methods offered when logging a (partial) payment. Free text in the DB,
// but this fixed list keeps the UI consistent with how By the C gets paid.
export const PAYMENT_METHODS = [
  "Zelle",
  "Check",
  "Cash",
  "eCheck (DPX)",
  "Stripe",
  "Airbnb / VRBO payout",
  "Other",
] as const;

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  monthly: "Monthly",
  first_month: "First month",
  last_month: "Last month",
  security_deposit: "Security deposit",
};

export const NOTIFY_VIA_LABEL: Record<NotifyVia, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
};

// =============================================================================
// Reminders / Follow-ups — quadro compartilhado (0015_reminders.sql).
// Qualquer interno cria um lembrete e designa a uma pessoa. Escalação é
// COMPUTADA AO VIVO (sem cron, sem timestamps de alerta) — ver src/lib/reminders.ts.
// TRAVADO: arquivar (archived_at), nunca deletar — só owner hard-delete.
// =============================================================================

export type ReminderStatus = "open" | "done";

// Link opcional a um registro (mesma família polimórfica de notes/documents).
export type ReminderParentType = "client" | "property" | "listing";

export interface Reminder {
  id: string;
  title: string;
  notes: string | null;
  assigned_to: string; // profiles.id — pessoa responsável
  created_by: string; // profiles.id — quem criou
  status: ReminderStatus;
  done_at: string | null;
  due_date: string | null; // opcional; se setado, ancora o relógio de escalação
  parent_type: ReminderParentType | null;
  parent_id: string | null;
  // Links opcionais e independentes: uma pessoa (cliente) E/OU uma propriedade.
  client_id: string | null;
  property_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // joins opcionais
  assignee?: Pick<ProfileLike, "id" | "full_name" | "role"> | null;
  creator?: Pick<ProfileLike, "id" | "full_name"> | null;
  client?: Pick<Client, "id" | "name"> | null;
  property?: Pick<Property, "id" | "address" | "address2"> | null;
}

export const REMINDER_STATUS_LABEL: Record<ReminderStatus, string> = {
  open: "Open",
  done: "Done",
};
