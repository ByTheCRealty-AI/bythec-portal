// Tipos do domínio By the C. Espelham as migrations em supabase/migrations.
// Mantidos à mão nesta rodada; futuramente gerar via `supabase gen types typescript`.

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
  co_client_name: string | null;
  co_client_email: string | null;
  co_client_phone: string | null;
  email_notifications: boolean;
  sms_notifications: boolean;
  active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  owner_id: string;
  address: string;
  address2: string | null;
  address_text: string | null;
  property_type: PropertyType;
  commission_fee: number | null;
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
  // join opcional
  owner?: Pick<Client, "id" | "name" | "email"> | null;
}

// Rótulos pt-BR (UI). Fonte única de verdade de exibição.
export const CLIENT_TYPE_LABEL: Record<ClientType, string> = {
  tenant: "Inquilino",
  airbnb_owner: "Dono Airbnb",
  landlord: "Locador",
  buy_sell_client: "Comprador / Vendedor",
  off_season_tenant: "Inquilino de inverno",
};

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  year_round_rental: "Aluguel anual",
  vacation_rental: "Temporada (Airbnb)",
  off_season_rental: "Inverno / off-season",
  for_sale: "À venda",
};

export const DEAL_SIDE_LABEL: Record<DealSide, string> = {
  buyer: "Comprador",
  seller: "Vendedor",
  both: "Comprador e vendedor",
};
