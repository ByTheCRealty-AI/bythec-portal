// Tipos do domínio By the C. Espelham as migrations em supabase/migrations.
// Mantidos à mão nesta rodada; futuramente gerar via `supabase gen types typescript`.

// Base do % da comissão seasonal (single source of truth na fórmula travada).
export type { SeasonalCommissionBase } from "./invoice-formula";
import type { SeasonalCommissionBase } from "./invoice-formula";

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
  name: string;
  service_type: string | null;
  phone: string | null;
  email: string | null;
  notify_via: NotifyVia | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
}

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
  created_at: string;
  archived_at: string | null;
}

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
export interface PaymentAttachment {
  id: string;
  file_url: string;
  file_name: string | null;
  content_type: string | null;
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
  status: PaymentStatus;
  received_at: string | null;
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
  property?: Pick<Property, "id" | "address" | "address2" | "property_type"> | null;
  tenant?: Pick<Client, "id" | "name"> | null;
  // Imported receipts (one per payment for the Bubble batch). May be empty.
  attachments?: PaymentAttachment[] | null;
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  due: "Due",
  received: "Received",
};

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
