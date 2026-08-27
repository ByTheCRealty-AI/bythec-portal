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
  // Multi-papel (0043): a verdade. client_type é derivado destas.
  is_tenant: boolean;
  is_landlord: boolean;
  is_airbnb_owner: boolean;
  is_buyer_seller: boolean;
  is_off_season_tenant: boolean;
  // LEGADO (migration 0026): a comissão de venda era digitada aqui, no deal.
  // Desde 2026-08-27 o Finances LÊ da propriedade (properties.sale_commission,
  // 0027) e estes campos não alimentam mais nenhum número. Mantidos só pra não
  // quebrar linhas antigas; nenhum deal chegou a ter valor. Ver migration 0041.
  sale_commission: number | null;
  sale_commission_received: boolean;
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
  // Cleaner padrão desta propriedade — auto-preenche cleaner_id + cleaner_amount_paid
  // dos invoices de temporada novos (editável por invoice). Interno (pra 1099s).
  default_cleaner_id: string | null;
  default_cleaner_amount: number | null;
  notes: string | null;
  photo_url: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // Sales (brokerage) — only meaningful on for_sale properties.
  realtor_id: string | null;
  // Multi-tipo (0042): a verdade. property_type acima é derivado destas.
  is_year_round: boolean;
  is_vacation: boolean;
  is_winter: boolean;
  is_for_sale: boolean;
  sale_status: string | null;
  // For Sale: list price + By the C's sale commission (migration 0027). rate = %
  // (drives the $ in the UI); sale_commission = $ earned (authoritative).
  sale_price: number | null;
  sale_commission_rate: number | null;
  sale_commission: number | null;
  // Data em que a casa foi vendida (editável na página da propriedade E na aba
  // Sales, migration 0034). Casa vendida = comissão ganha: dirige o mês do stream
  // Sales no Finances, que não tem etapa de "owed" (0041).
  sold_at: string | null;
  // Aparece no formulário público /apply quando true (migration 0029).
  accepting_applications?: boolean;
  accepts_year_round?: boolean;
  accepts_winter?: boolean;
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

// ---------------------------------------------------------------------------
// MULTI-TIPO (migrations 0042 properties / 0043 clients)
// Uma casa pode ser temporada E inverno E estar à venda; uma pessoa pode ser
// landlord E buyer/seller. As flags is_* são a verdade; property_type e
// client_type são DERIVADOS por trigger e servem só pra leituras antigas.
// FILTRAR sempre por flag — filtrar pelo derivado faz o registro sumir da aba.
// ---------------------------------------------------------------------------

export type PropertyTypeFlag = "is_year_round" | "is_vacation" | "is_winter" | "is_for_sale";
export type ClientRoleFlag =
  | "is_tenant"
  | "is_landlord"
  | "is_airbnb_owner"
  | "is_buyer_seller"
  | "is_off_season_tenant";

// Ordem de exibição dos selos e das checkboxes dos formulários.
export const PROPERTY_TYPE_FLAGS: { flag: PropertyTypeFlag; label: string; hint: string }[] = [
  { flag: "is_year_round", label: "Year-Round Rental", hint: "Rented on a 12-month lease." },
  { flag: "is_vacation", label: "Vacation Rental", hint: "Summer / Airbnb / VRBO." },
  { flag: "is_winter", label: "Off-Season Rental", hint: "Winter rental. Can pair with vacation." },
  { flag: "is_for_sale", label: "For Sale", hint: "On the market. A rented house can also be for sale." },
];

export const CLIENT_ROLE_FLAGS: { flag: ClientRoleFlag; label: string; hint: string }[] = [
  { flag: "is_tenant", label: "Tenant", hint: "Rents a year-round property." },
  { flag: "is_landlord", label: "Landlord", hint: "Owns a year-round rental we manage." },
  { flag: "is_airbnb_owner", label: "Airbnb Owner", hint: "Owns a vacation rental we manage." },
  { flag: "is_off_season_tenant", label: "Off-Season Tenant", hint: "Winter / off-season renter." },
  { flag: "is_buyer_seller", label: "Buyer / Seller", hint: "Buying or selling with us." },
];

// Checkboxes do formulário -> flags booleanas. Nenhuma marcada cai no default
// (year-round / tenant), a mesma rede de segurança do trigger no banco.
// Vivem AQUI e não nas actions: arquivo "use server" só pode exportar função
// async, e estes helpers são síncronos.
export function propertyTypeFlagsFromForm(fd: FormData): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  let any = false;
  for (const { flag } of PROPERTY_TYPE_FLAGS) {
    const on = fd.get(flag) === "1" || fd.get(flag) === "on";
    out[flag] = on;
    if (on) any = true;
  }
  if (!any) out.is_year_round = true;
  return out;
}

export function clientRoleFlagsFromForm(fd: FormData): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  let any = false;
  for (const { flag } of CLIENT_ROLE_FLAGS) {
    const on = fd.get(flag) === "1" || fd.get(flag) === "on";
    out[flag] = on;
    if (on) any = true;
  }
  if (!any) out.is_tenant = true;
  return out;
}

// Selos de uma linha: todos os tipos que a casa/pessoa realmente tem.
export function propertyTypeLabels(p: {
  is_year_round?: boolean | null;
  is_vacation?: boolean | null;
  is_winter?: boolean | null;
  is_for_sale?: boolean | null;
  property_type?: PropertyType | null;
}): string[] {
  const out = PROPERTY_TYPE_FLAGS.filter((f) => p[f.flag]).map((f) => f.label);
  // Linha antiga que ainda não passou pelo backfill: cai no derivado.
  if (out.length === 0 && p.property_type) return [PROPERTY_TYPE_LABEL[p.property_type]];
  return out;
}

export function clientRoleLabels(c: {
  is_tenant?: boolean | null;
  is_landlord?: boolean | null;
  is_airbnb_owner?: boolean | null;
  is_buyer_seller?: boolean | null;
  is_off_season_tenant?: boolean | null;
  client_type?: ClientType | null;
}): string[] {
  const out = CLIENT_ROLE_FLAGS.filter((f) => c[f.flag]).map((f) => f.label);
  if (out.length === 0 && c.client_type) return [CLIENT_TYPE_LABEL[c.client_type]];
  return out;
}

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

export type InvoiceKind = "seasonal" | "service" | "general";
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
  // Interno (não vai pro PDF do owner): quanto a By the C REALMENTE paga o cleaner
  // (pode ser < cleaning_fee; a diferença é ganho da By the C) + qual cleaner
  // (service_provider) recebeu — pra totais de 1099 no fim do ano.
  cleaner_amount_paid: number | null;
  cleaner_id: string | null;
  // Como a By the C pagou owner e cleaner (interno). "owner pago" = flag `paid`.
  owner_payment_method: string | null;
  cleaner_payment_method: string | null;
  // Nº do cheque (só relevante quando o método é Check/eCheck).
  owner_check_number: string | null;
  cleaner_check_number: string | null;
  vrbo_commission: number | null;
  vrbo_payment_fee: number | null;
  vrbo_property_damage: number | null;

  // ---- SERVICE (long-term/manutenção). Labor + Material = Total (owner-facing).
  // A By the C cobra 10% de comissão EMBUTIDA no preço: total = round(cost*1.10,2).
  // labor_total/material_total são o que o OWNER paga (comissão já dentro).
  labor_total: number | null;
  material_total: number | null;
  // ---- GENERAL (cobrança simples avulsa). Soma dos itens (description + amount).
  // Sem custo de worker, sem comissão. general_total = o que o cliente paga.
  general_total: number | null;
  service_address: string | null; // endereço digitado quando não há property_id
  work_date: string | null; // data do serviço (distinta de `date` = data de criação)
  provider_id: string | null; // quem fez o serviço (service_providers). Opcional.
  // INTERNO — custo do worker + comissão da By the C (10%, embutida no preço acima).
  labor_cost: number | null; // custo de labor do worker
  material_cost: number | null; // custo de material do worker
  service_commission: number | null; // (labor_total+material_total) − (labor_cost+material_cost)
  // Rastreio de 5 estados (owner-paid reusa paid/paid_date).
  sent_to_owner: boolean;
  sent_at: string | null;
  labor_paid: boolean; // labor pago ao worker
  labor_paid_at: string | null;
  material_paid: boolean; // material pago ao worker
  material_paid_at: string | null;
  commission_collected: boolean; // comissão recebida (auto-marca quando owner paga)
  commission_collected_at: string | null;

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
  total: number; // sinal livre; semântica vem de type. SERVICE: preço ao owner (comissão embutida).
  type: InvoiceItemType;
  guest: boolean; // aparece no overview do guest (seasonal)
  owner: boolean; // aparece no overview do owner (seasonal)
  category: InvoiceItemCategory | null; // 'labor' | 'material' (service)
  cost: number | null; // SERVICE: custo do worker. total = round(cost*1.10,2). NULL em seasonal.
  created_at: string;
}

export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  seasonal: "Seasonal",
  service: "Service",
  general: "General",
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
  // Autoria.
  created_by?: string | null;
  created_by_name?: string | null;
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
  // Autoria.
  created_by?: string | null;
  created_by_name?: string | null;
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
  // Autoria: id do criador + nome resolvido (via operator_names) pra exibir.
  created_by?: string | null;
  created_by_name?: string | null;
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
  // migration 0024 — manual ordering (owner/manager). When set, orders the doc
  // within its tenant group (ascending); null falls back to doc_date desc.
  sort_order: number | null;
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
// Expenses — despesas do negócio / por propriedade. Tabela `expenses` (0003 +
// enum paid_by). Aba Expenses = owner + manager + secretária (cap expenses.manage).
// =============================================================================
export type PaidBy = "bythec" | "owner" | "tenant" | "other";
export const PAID_BY_LABEL: Record<PaidBy, string> = {
  bythec: "By the C",
  owner: "Owner",
  tenant: "Tenant",
  other: "Other",
};

// Categorias sugeridas (texto livre no banco; dropdown com opção de digitar).
export const EXPENSE_CATEGORY_OPTIONS: string[] = [
  "Maintenance / Repairs",
  "Cleaning",
  "Landscaping / Lawn",
  "Utilities",
  "Supplies",
  "Insurance",
  "Taxes / Fees",
  "Permits / Registration",
  "Marketing / Advertising",
  "Software / Subscriptions",
  "Office",
  "Travel / Mileage",
  "Professional Services",
  "Gifts",
  "Other",
];

export interface Expense {
  id: string;
  description: string;
  price: number;
  date: string;
  due_date: string | null;
  paid: boolean;
  paid_by: PaidBy | null;
  category: string | null;
  vendor: string | null;
  property_id: string | null;
  client_id: string | null;
  archived_at: string | null;
  created_at: string;
  // joins opcionais
  property?: Pick<Property, "id" | "address" | "address2"> | null;
  client?: Pick<Client, "id" | "name"> | null;
  attachments?: ExpenseAttachment[];
}

// Recibos anexados a uma despesa (qualquer mídia). file_url = path no bucket
// privado `documents` (upload client-side) OU URL externa (legado http). Viewer
// abre via signed URL. Tabela `expense_attachments` (RLS = has_cap expenses.manage).
export interface ExpenseAttachment {
  id: string;
  expense_id: string;
  file_url: string;
  file_name: string | null;
  content_type: string | null;
  created_at: string;
}

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

// --- Rental applications (aplicação de aluguel PÚBLICA, migration 0029) -------
export type ApplicationStatus = "new" | "reviewing" | "approved" | "denied" | "withdrawn";

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  approved: "Approved",
  denied: "Denied",
  withdrawn: "Withdrawn",
};

// Linha exibida no painel interno. NUNCA inclui o ciphertext (ssn_encrypted);
// o SSN só é decifrado sob demanda via revealSSNAction (gated + auditado).
export interface RentalApplication {
  id: string;
  language: "en" | "pt";
  status: ApplicationStatus;

  rental_type: string | null;       // 'year_round' | 'winter'
  lease_start: string | null;       // data desejada de início (YYYY-MM-DD)
  property_id: string | null;
  property_other: string | null;

  full_name: string;
  date_of_birth: string | null;
  has_ssn: boolean | null;
  ssn_last4: string | null;
  ssn_none_explanation: string | null;
  phone: string | null;
  has_license: boolean | null;
  drivers_license: string | null;
  drivers_license_state: string | null;
  gov_id_type: string | null;
  gov_id_number: string | null;
  email: string | null;

  occupants_count: number | null;
  occupants: Array<{ name?: string; dob?: string; is_adult?: boolean; phone?: string }>;
  rental_history: Array<{
    kind?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    duration?: string;
    landlord_name?: string;
    landlord_phone?: string;
  }>;
  vehicles: Array<{ make_model?: string; year?: string; color?: string; plate?: string; plate_state?: string }>;

  employer: string | null;
  employer_address: string | null;
  manager_name: string | null;
  manager_phone: string | null;
  job_title: string | null;
  monthly_income: number | null;
  length_of_employment: string | null;

  personal_references: Array<{ name?: string; phone?: string }>;

  evicted: boolean | null;
  evicted_detail: string | null;
  felony: boolean | null;
  felony_detail: string | null;
  bankruptcy: boolean | null;
  bankruptcy_detail: string | null;
  smokes: boolean | null;
  has_pets: boolean | null;
  pets_detail: string | null;
  reason_for_moving: string | null;

  consent_agreed: boolean;
  signature_name: string | null;
  signature_date: string | null;
  signature_name_2: string | null;
  signature_date_2: string | null;
  consent_ip: string | null;

  fee_amount: number | null;
  payment_status: "unpaid" | "paid";
  paid_at: string | null;

  internal_notes: string | null;
  ssn_last_revealed_at: string | null;

  archived_at: string | null;
  submitted_at: string;
  created_at: string;

  // joins opcionais
  property?: Pick<Property, "id" | "address" | "address2"> | null;
  attachments?: RentalApplicationAttachment[];
}

// Anexo de government ID (candidato ou ocupante 18+). Bucket privado `documents`.
export interface RentalApplicationAttachment {
  id: string;
  application_id: string;
  category: "applicant_id" | "occupant_id";
  occupant_index: number | null;
  label: string | null;
  file_path: string;
  file_name: string | null;
  content_type: string | null;
  created_at: string;
}

// =============================================================================
// LISTINGS — o anúncio que aparece no site público (bythecrealty.com)
// =============================================================================
// Diferente de `property`: a property é o imóvel que a By the C administra
// (nunca deletada, só arquivada); a listing é a PEÇA DE MARKETING dele. Uma
// listing pode ser deletada por qualquer um do time (recuperável) e o expurgo
// definitivo é owner-only, via RPC admin_delete_listing (migration 0037).
//
// Dois interruptores diferentes, que a Andrea trata como coisas distintas:
//   active   — está no ar no site? false = some do site, mas o registro fica.
//   featured — sobe pra home do site (só vale se active também for true).

export type ListingType = "rental" | "sale";

export type ListingStatus =
  | "active"
  | "pending"
  | "sold"
  | "rented"
  | "off_market";

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  active: "Active",
  pending: "Pending",
  sold: "Sold",
  rented: "Rented",
  off_market: "Off market",
};

// `category` reusa o enum property_type e é o que decide EM QUAL ABA do site a
// listing cai: for_sale → For Sale · year_round_rental → Long-Term ·
// vacation_rental/off_season_rental → Vacation & Winter.
export const LISTING_CATEGORY_LABEL: Record<PropertyType, string> = {
  for_sale: "For Sale",
  year_round_rental: "Long-Term (Year-Round)",
  vacation_rental: "Vacation Rental",
  off_season_rental: "Winter / Off-Season",
};

// Aba do site pública correspondente a cada category (só pra mostrar ao usuário
// onde a listing vai aparecer). Espelha deriveTab() em website/src/lib/listings.ts.
export const LISTING_CATEGORY_TAB: Record<PropertyType, string> = {
  for_sale: "For Sale",
  year_round_rental: "Long-Term Rentals",
  vacation_rental: "Vacation & Winter",
  off_season_rental: "Vacation & Winter",
};

export interface Listing {
  id: string;
  // Propriedade que a By the C já administra e que esta listing anuncia.
  // Opcional: existe listing de imóvel que não está sob gestão. O endereço é
  // COPIADO na hora de escolher (não lido pelo FK) — a listing é peça de
  // marketing e continua dizendo o que dizia mesmo se a property mudar/sumir.
  property_id: string | null;
  client_id: string | null; // dono do imóvel — INTERNO, nunca vai pro site
  address: string;
  address2: string | null; // unidade/apto — da nossa base, NUNCA do Google
  description: string | null;
  available_date: string | null;
  // Link externo clicável pro anúncio real. Airbnb pra temporada, CCIAOR/MLS
  // pra venda e long-term. Os dois são opcionais e podem coexistir.
  airbnb_link: string | null;
  mls_link: string | null;
  listing_id: string | null; // nº do anúncio no MLS/Airbnb
  price: number | null;
  listing_type: ListingType;
  listing_status: ListingStatus;
  active: boolean;
  featured: boolean;
  cover_photo_url: string | null;
  // Specs
  bedrooms: number | null;
  bathrooms: number | null;
  half_baths: number | null;
  garage: number | null;
  guests: number | null;
  // Migration 0040 — tipos INDEPENDENTES: uma casa pode ser vacation E winter,
  // à venda E alugada, etc. Qualquer combinação vale.
  is_for_sale: boolean;
  is_year_round: boolean;
  is_vacation: boolean;
  is_winter: boolean;
  // DERIVADA das flags por trigger. Existe só pro site atual, que escolhe a aba
  // por ela. Não editar à mão — escrever nas flags acima.
  category: PropertyType | null;
  sqft: number | null;
  slug: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

// Colunas que a tela de Listings lê. Mantido junto do tipo pra não sair de
// sincronia com o select da página.
export const LISTING_COLUMNS =
  "id, property_id, client_id, is_for_sale, is_year_round, is_vacation, is_winter, address, address2, description, available_date, airbnb_link, mls_link, listing_id, price, listing_type, listing_status, active, featured, cover_photo_url, bedrooms, bathrooms, half_baths, garage, guests, category, sqft, slug, archived_at, created_at, updated_at";

// Propriedade oferecida no picker "pull from an existing property" do form de
// listing. Só os campos que o form usa pra preencher sozinho.
export interface ListingPropertyOption {
  id: string;
  address: string;
  address2: string | null;
  owner_id: string | null;
  // Flags da propriedade (0042) — mesmos nomes das flags da listing, então o
  // pré-preenchimento copia TODAS de uma vez.
  is_for_sale: boolean;
  is_year_round: boolean;
  is_vacation: boolean;
  is_winter: boolean;
  rent_price: number | null;
  photo_url: string | null;
}

// Foto da listing. Vive no bucket PÚBLICO `listing-photos` (separado do
// `documents`, que é privado e guarda invoices + IDs com SSN — regra travada:
// os dois nunca se misturam). A de menor sort_order é a CAPA; um trigger no
// banco mantém listings.cover_photo_url apontando pra ela.
export interface ListingPhoto {
  id: string;
  listing_id: string;
  storage_path: string;
  url: string;
  sort_order: number;
  created_at: string;
  created_by: string | null;
}

// Os 4 tipos que uma listing pode ter, INDEPENDENTES entre si (migration 0040).
// A ordem aqui é a ordem que aparece no form e nos chips.
export type ListingTypeFlag = "is_for_sale" | "is_year_round" | "is_vacation" | "is_winter";

export const LISTING_TYPE_FLAGS: ListingTypeFlag[] = [
  "is_for_sale",
  "is_year_round",
  "is_vacation",
  "is_winter",
];

export const LISTING_TYPE_FLAG_LABEL: Record<ListingTypeFlag, string> = {
  is_for_sale: "For Sale",
  is_year_round: "Year-Round Rental",
  is_vacation: "Vacation Rental",
  is_winter: "Winter / Off-Season",
};

export const LISTING_TYPE_FLAG_HINT: Record<ListingTypeFlag, string> = {
  is_for_sale: "The home is on the market.",
  is_year_round: "Long-term tenant, twelve months.",
  is_vacation: "Short stays in season (Airbnb / VRBO).",
  is_winter: "Off-season rental, roughly September to May.",
};

// Quais flags a listing tem, na ordem canônica.
export function listingTypeFlags(l: {
  is_for_sale?: boolean | null;
  is_year_round?: boolean | null;
  is_vacation?: boolean | null;
  is_winter?: boolean | null;
}): ListingTypeFlag[] {
  return LISTING_TYPE_FLAGS.filter((f) => l[f] === true);
}
