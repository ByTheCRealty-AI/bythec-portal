// =============================================================================
// /apply — tipos de entrada do formulário (compartilhados client + server)
// =============================================================================
// Fica FORA de actions.ts de propósito: um módulo "use server" só pode exportar
// funções async. Estes tipos são importados tanto pela action quanto pelo form.
// =============================================================================

export interface OccupantInput {
  name: string;
  dob: string;
  is_adult: boolean;   // 18 ou mais?
  phone: string;       // obrigatório se 18+ (e ≠ do candidato)
  // Andrea 2026-10-30: e-mail obrigatório pra maior de 18; parentesco com o
  // candidato obrigatório pra TODOS (inclusive menores).
  email: string;
  // Opcional (Andrea 2026-10-30).
  relationship: string;
  // Andrea 2026-10-30: pergunta obrigatória pra quem tem 18+.
  co_applicant: boolean;
}

export interface HistoryInput {
  kind: "current" | "previous";
  street: string;
  city: string;
  state: string;
  zip: string;
  duration: string;
  landlord_name: string;
  landlord_phone: string;
  // Só no endereço atual: 10+ anos no mesmo lugar dispensa o endereço anterior.
  ten_plus_years?: boolean;
}

export interface VehicleInput { make_model: string; year: string; color: string; plate: string; plate_state: string }

export interface ReferenceInput { name: string; phone: string }

// Anexo de ID já enviado pro storage (path staged), a ligar na submissão.
export interface AttachmentInput {
  file_path: string;
  category: "applicant_id" | "occupant_id" | "income_proof";
  occupant_index: number | null;
  label: string | null;
  file_name: string | null;
  content_type: string | null;
}

export interface ApplicationInput {
  language: "en" | "pt";
  rental_type: "year_round" | "winter" | null;
  lease_start: string | null;
  property_id: string | null;
  property_other: string | null;

  full_name: string;
  date_of_birth: string | null;

  // SSN/ITIN — pergunta obrigatória; sem SSN exige explicação.
  has_ssn: boolean;
  ssn: string | null;
  ssn_none_explanation: string | null;

  phone: string | null;

  // Driver's license OU (se não tem) government ID (State ID / Passport) + número.
  has_license: boolean;
  drivers_license: string | null;
  drivers_license_state: string | null;
  gov_id_type: "state_id" | "passport" | null;
  gov_id_number: string | null;

  email: string | null;

  occupants_count: number | null;
  occupants: OccupantInput[];
  rental_history: HistoryInput[];
  vehicles: VehicleInput[];

  // Situação de emprego: os campos de empregador só valem pra "employed";
  // autônomo e aposentado mandam comprovante de renda (category income_proof).
  employment_status: "employed" | "self_employed" | "retired" | null;
  retirement_income_sources: string[] | null;
  retired_since: string | null;
  business_name: string | null;
  business_type: string | null;
  employer: string | null;
  employer_address: string | null;
  manager_name: string | null;
  manager_phone: string | null;
  job_title: string | null;
  monthly_income: number | null;
  length_of_employment: string | null;

  personal_references: ReferenceInput[];

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

  attachments: AttachmentInput[];

  co_applicants: CoApplicantInput[];

  stripe_payment_intent_id: string;
}

// Co-applicant responde o mesmo que o candidato, menos os dados do imóvel e dos
// ocupantes (Andrea 2026-10-30). Assina por conta própria.
export type CoApplicantInput = Omit<
  ApplicationInput,
  | "language" | "rental_type" | "lease_start" | "property_id" | "property_other"
  | "occupants_count" | "occupants" | "signature_name_2" | "signature_date_2"
  | "co_applicants" | "stripe_payment_intent_id"
>;

// Opção de propriedade passada do server pro dropdown público.
export interface PropertyOption {
  id: string;
  label: string;
  accepts_year_round: boolean;
  accepts_winter: boolean;
}

// Taxa que a By the C RECEBE líquido: $100 + $50 por co-applicant.
export const MAX_CO_APPLICANTS = 10;
export function applicationBaseCents(coApplicants: number): number {
  return 10000 + 5000 * coApplicants;
}
// Valor TOTAL cobrado no cartão (cents) — líquido + gross-up do fee Stripe
// (US card: 2.9% + $0.30), que cresce junto com o valor. 0 = $103.30, 1 = $154.79,
// 2 = $206.29. Fonte única: o form (Payment Element deferido) e o server leem
// daqui, então o valor exibido e o cobrado nunca divergem.
export function applicationFeeCents(coApplicants: number): number {
  return Math.ceil((applicationBaseCents(coApplicants) + 30) / (1 - 0.029));
}
// Métodos aceitos — os MESMOS no Payment Element e no PaymentIntent (exigência
// do modo deferido). Nenhum deles redireciona pra fora da página.
export const APPLICATION_PAYMENT_METHODS = ["card", "link"] as const;
