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
}

export interface HistoryInput {
  kind: "current" | "previous";
  street: string;
  city_state_zip: string;
  duration: string;
  landlord_name: string;
  landlord_phone: string;
}

export interface VehicleInput { make_model: string; year: string; color: string; plate: string; plate_state: string }

export interface ReferenceInput { name: string; phone: string }

// Anexo de ID já enviado pro storage (path staged), a ligar na submissão.
export interface AttachmentInput {
  file_path: string;
  category: "applicant_id" | "occupant_id";
  occupant_index: number | null;
  label: string | null;
  file_name: string | null;
  content_type: string | null;
}

export interface ApplicationInput {
  language: "en" | "pt";
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

  stripe_payment_intent_id: string;
}

// Opção de propriedade passada do server pro dropdown público.
export interface PropertyOption { id: string; label: string }
