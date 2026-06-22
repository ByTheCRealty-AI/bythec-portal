// =============================================================================
// By the C — Seasonal invoice formula (LOCKED). Single source of truth.
// =============================================================================
// Verified against two real invoices (#335 Airbnb, #240 Airbnb). The server
// (actions.ts) and the client (live preview) BOTH import this so they can never
// drift. See docs/invoice-formats.md for the full decoded layout + worked
// examples. DO NOT change the math without re-checking both examples.
// =============================================================================

// Arredonda pra 2 casas evitando erro de ponto flutuante (ex.: 275.42, não 275.41999…).
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface SeasonalFormulaInput {
  // Paid by Guest
  room_fee: number; // diária × noites (Rental Nights)
  rental_discount: number; // Rental Discount (subtraído)
  cleaning_fee: number;
  guest_service_fee: number;
  occupancy_taxes: number; // Occupancy / Lodging taxes
  vrbo_property_damage: number; // só VRBO; 0 se não houver

  // Owner Overview
  host_payout: number; // "Host Payout" / "You earn"
  host_service_fee: number; // Platform Host Service Fee
  commission_rate: number; // fração (0.10 = 10%); vem da property, editável por invoice
  cleaning_goes_to: "owner" | "bythec"; // flag POR INVOICE (deduz cleaning do owner?)
  extra_deductions: number[]; // deduções extras do owner (ex.: Hot Tub Maintenance)
}

export interface SeasonalFormulaResult {
  total_paid_by_guest: number;
  bythec_commission: number;
  total_received_by_owner: number;
}

// FÓRMULA TRAVADA. Reproduz exatamente os invoices #335 e #240.
export function computeSeasonal(input: SeasonalFormulaInput): SeasonalFormulaResult {
  const {
    room_fee,
    rental_discount,
    cleaning_fee,
    guest_service_fee,
    occupancy_taxes,
    vrbo_property_damage,
    host_payout,
    host_service_fee,
    commission_rate,
    cleaning_goes_to,
    extra_deductions,
  } = input;

  // total_paid_by_guest = room − discount + cleaning + guest_service + occ_tax (+ vrbo property damage)
  const total_paid_by_guest = round2(
    room_fee -
      rental_discount +
      cleaning_fee +
      guest_service_fee +
      occupancy_taxes +
      vrbo_property_damage
  );

  // bythec_commission = round(commission_rate × total_paid_by_guest, 2)
  const bythec_commission = round2(commission_rate * total_paid_by_guest);

  // total_received_by_owner =
  //   host_payout − host_service_fee − bythec_commission
  //   − (cleaning_fee se cleaning_goes_to = 'bythec')
  //   − sum(extra_deductions)
  const cleaningDeduction = cleaning_goes_to === "bythec" ? cleaning_fee : 0;
  const extras = extra_deductions.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);

  const total_received_by_owner = round2(
    host_payout - host_service_fee - bythec_commission - cleaningDeduction - extras
  );

  return { total_paid_by_guest, bythec_commission, total_received_by_owner };
}
