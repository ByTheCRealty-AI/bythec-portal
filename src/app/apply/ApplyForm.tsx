"use client";

// =============================================================================
// /apply — formulário público bilíngue (EN/PT) + pagamento Stripe ($50).
// =============================================================================
// Fluxo: monta -> cria PaymentIntent ($50) -> candidato preenche + envia IDs +
// cartão -> VALIDA tudo (obrigatórios) -> confirmPayment (inline) ->
// submitApplication (server re-valida pagamento, cifra SSN, grava + liga anexos)
// -> /apply/thank-you.
//
// Government IDs sobem por signed upload URL (bucket privado) ANTES do submit;
// só o caminho é enviado. Ocupantes 18+ exigem telefone (≠ do candidato) + ID.
// =============================================================================

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { DICT, type Lang } from "./i18n";
import type {
  ApplicationInput,
  AttachmentInput,
  CoApplicantInput,
  HistoryInput,
  PropertyOption,
  ReferenceInput,
  VehicleInput,
} from "./types";
import { APPLICATION_PAYMENT_METHODS, applicationBaseCents, applicationFeeCents } from "./types";
import { createApplicationPaymentIntent, createIdUploadUrl, submitApplication } from "./actions";
import { createClient } from "@/lib/supabase/client";

const PUBLISHABLE = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = PUBLISHABLE ? loadStripe(PUBLISHABLE) : null;
const OTHER = "__other__";
// Rascunho salvo NO APARELHO do candidato (localStorage), pra quem sai no meio
// não perder tudo. NUNCA guarda o SSN. Limpo depois do envio com sucesso.
// Restaurar o rascunho não toca no Stripe: o PaymentIntent continua nascendo
// só no clique em Pagar.
const DRAFT_KEY = "bythec-apply-draft-v1";
const RETIRE_SOURCES = ["social_security", "pension", "retirement_account", "annuity", "other"] as const;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function digits(s: string): string {
  return (s || "").replace(/\D/g, "");
}
// Formata telefone US enquanto digita: (508) 555-1234.
// Andrea 2026-10-30: o e-mail precisa ser um endereço de verdade, não só
// "tem algo escrito". Checagem simples (algo@algo.algo) — sem regex exótica.
function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

// Campo de renda: o que se digita são DÓLARES — 5000 vira $5,000.00 (Andrea
// 2026-10-30). Centavos só se a pessoa digitar o ponto: 5000.50 -> $5,000.50.
// Guarda o texto limpo ("5000" / "5000.5"); a tela mostra formatado.
function cleanMoney(v: string): string {
  const cleaned = (v || "").replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  const cents = rest.join("").slice(0, 2);
  return (whole.replace(/^0+(?=\d)/, "").slice(0, 9) || "") + (cleaned.includes(".") ? "." + cents : "");
}

// typing=true: NÃO força os ".00" — senão o ponto fica no caminho da próxima
// tecla e o campo trava em $5.00. Enquanto digita: $5 -> $50 -> $5,000.
// Ao sair do campo, fecha com os centavos: $5,000.00.
function formatMoney(v: string, typing: boolean): string {
  if (!v) return typing ? "" : "$0.00";
  const [whole, cents] = v.split(".");
  const grouped = Number(whole || "0").toLocaleString("en-US");
  if (typing) return "$" + grouped + (v.includes(".") ? "." + (cents ?? "") : "");
  return "$" + grouped + "." + (cents ?? "").padEnd(2, "0").slice(0, 2);
}

// A opção "moro aqui há 5+ anos" só aparece quando a pessoa digita 5 ou mais no
// tempo de moradia (Andrea 2026-10-30: era 10, virou 5). A CHAVE guardada
// continua `ten_plus_years` de propósito — renomear órfãnaria as aplicações já
// enviadas; quem marcou com 10+ também satisfaz 5+.
const LONG_STAY_YEARS = 5;
function longStayTyped(duration: string): boolean {
  const years = (duration || "").match(/(\d+)\s*(y|yr|yrs|year|years|ano|anos)?/i);
  const n = years ? Number(years[1]) : NaN;
  return Number.isFinite(n) && n >= LONG_STAY_YEARS;
}

// Nascimento sempre MM/DD/YYYY (Andrea 2026-10-30): as barras entram sozinhas e o
// ano precisa dos 4 dígitos. Guardado como texto, igual antes.
function formatDob(v: string): string {
  const d = digits(v).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
function isDob(v: string): boolean {
  const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const [mo, da, yr] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(yr, mo - 1, da);
  return dt.getMonth() === mo - 1 && dt.getDate() === da && yr >= 1900 && dt <= new Date();
}

function formatPhone(v: string): string {
  const d = digits(v).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

interface UploadedFile { path: string; file_name: string; content_type: string }
interface OccRow {
  name: string; dob: string; is_adult: boolean; phone: string; email: string; relationship: string; idFile: UploadedFile | null;
  co_applicant: "" | "yes" | "no"; // obrigatório pra 18+
  co: CoData;
}

// O que o co-applicant preenche além do que já está na linha do ocupante (nome,
// nascimento, telefone, e-mail, ID): o mesmo do candidato, menos imóvel/ocupantes.
interface CoData {
  has_ssn: "" | "yes" | "no";
  tax_id_type: "" | "ssn" | "itin";
  ssn: string;
  ssn_none_explanation: string;
  has_license: "" | "yes" | "no";
  drivers_license: string;
  drivers_license_state: string;
  gov_id_type: "" | "state_id" | "passport";
  gov_id_number: string;
  history: HistoryInput[];
  vehicles: VehicleInput[];
  employment_status: "" | "employed" | "self_employed" | "retired";
  retirement_income_sources: string[];
  retired_since: string;
  business_name: string;
  business_type: string;
  employer: string;
  employer_address: string;
  manager_name: string;
  manager_phone: string;
  job_title: string;
  monthly_income: string;
  length_of_employment: string;
  incomeProofs: UploadedFile[];
  refs: ReferenceInput[];
  evicted: "" | "yes" | "no";
  evicted_detail: string;
  felony: "" | "yes" | "no";
  felony_detail: string;
  bankruptcy: "" | "yes" | "no";
  bankruptcy_detail: string;
  smokes: "" | "yes" | "no";
  has_pets: "" | "yes" | "no";
  pets_detail: string;
  reason_for_moving: string;
  consent_agreed: boolean;
  signature_name: string;
  signature_date: string;
}

interface FlatState {
  rental_type: "" | "year_round" | "winter";
  lease_start: string;
  property_id: string;
  property_other: string;
  full_name: string;
  date_of_birth: string;
  has_ssn: "" | "yes" | "no";
  tax_id_type: "" | "ssn" | "itin";
  ssn: string;
  ssn_none_explanation: string;
  phone: string;
  has_license: "" | "yes" | "no";
  drivers_license: string;
  drivers_license_state: string;
  gov_id_type: "" | "state_id" | "passport";
  gov_id_number: string;
  email: string;
  occupants_count: string;
  employment_status: "" | "employed" | "self_employed" | "retired";
  retirement_income_sources: string[];
  retired_since: string;
  business_name: string;
  business_type: string;
  employer: string;
  employer_address: string;
  manager_name: string;
  manager_phone: string;
  job_title: string;
  monthly_income: string;
  length_of_employment: string;
  evicted: "" | "yes" | "no";
  evicted_detail: string;
  felony: "" | "yes" | "no";
  felony_detail: string;
  bankruptcy: "" | "yes" | "no";
  bankruptcy_detail: string;
  smokes: "" | "yes" | "no";
  has_pets: "" | "yes" | "no";
  pets_detail: string;
  reason_for_moving: string;
  consent_agreed: boolean;
  signature_name: string;
  signature_date: string;
  signature_name_2: string;
  signature_date_2: string;
}

const EMPTY_FLAT: FlatState = {
  rental_type: "", lease_start: "", property_id: "", property_other: "", full_name: "", date_of_birth: "",
  has_ssn: "", tax_id_type: "", ssn: "", ssn_none_explanation: "", phone: "",
  has_license: "", drivers_license: "", drivers_license_state: "", gov_id_type: "", gov_id_number: "",
  email: "", occupants_count: "",
  employment_status: "", retirement_income_sources: [], retired_since: "", business_name: "", business_type: "",
  employer: "", employer_address: "", manager_name: "", manager_phone: "", job_title: "",
  monthly_income: "", length_of_employment: "",
  evicted: "", evicted_detail: "", felony: "", felony_detail: "", bankruptcy: "", bankruptcy_detail: "",
  smokes: "", has_pets: "", pets_detail: "", reason_for_moving: "",
  consent_agreed: false, signature_name: "", signature_date: todayISO(), signature_name_2: "", signature_date_2: "",
};

const emptyHist = (kind: "current" | "previous"): HistoryInput => ({
  kind, street: "", city: "", state: "", zip: "", duration: "", landlord_name: "", landlord_phone: "",
});
const emptyVeh = (): VehicleInput => ({ make_model: "", year: "", color: "", plate: "", plate_state: "" });
const emptyCo = (): CoData => ({
  has_ssn: "", tax_id_type: "", ssn: "", ssn_none_explanation: "",
  has_license: "", drivers_license: "", drivers_license_state: "", gov_id_type: "", gov_id_number: "",
  history: [emptyHist("current"), emptyHist("previous")],
  vehicles: [emptyVeh()],
  employment_status: "", retirement_income_sources: [], retired_since: "", business_name: "", business_type: "",
  employer: "", employer_address: "", manager_name: "", manager_phone: "", job_title: "",
  monthly_income: "", length_of_employment: "", incomeProofs: [],
  refs: [{ name: "", phone: "" }, { name: "", phone: "" }],
  evicted: "", evicted_detail: "", felony: "", felony_detail: "", bankruptcy: "", bankruptcy_detail: "",
  smokes: "", has_pets: "", pets_detail: "", reason_for_moving: "",
  consent_agreed: false, signature_name: "", signature_date: todayISO(),
});
const emptyOcc = (): OccRow => ({
  name: "", dob: "", is_adult: false, phone: "", email: "", relationship: "", idFile: null,
  co_applicant: "", co: emptyCo(),
});
// Veículo é opcional (Andrea 2026-10-30), mas quem começa a preencher completa.
const vehicleStarted = (v: VehicleInput) => Object.values(v).some((x) => x.trim() !== "");
const dollars = (cents: number) => "$" + (cents / 100).toFixed(2);

export default function ApplyForm({ properties }: { properties: PropertyOption[] }) {
  const [lang, setLang] = useState<Lang>("en");
  const d = DICT[lang];

  const [f, setF] = useState<FlatState>(EMPTY_FLAT);
  const set = <K extends keyof FlatState>(k: K, v: FlatState[K]) => setF((p) => ({ ...p, [k]: v }));

  const [occupants, setOccupants] = useState<OccRow[]>([emptyOcc()]);
  const [history, setHistory] = useState<HistoryInput[]>([
    emptyHist("current"), emptyHist("previous"),
  ]);
  const tenPlus = history.some((h) => h.kind === "current" && h.ten_plus_years);
  const [vehicles, setVehicles] = useState<VehicleInput[]>([emptyVeh()]);
  const [refs, setRefs] = useState<ReferenceInput[]>([
    { name: "", phone: "" }, { name: "", phone: "" },
  ]);
  const [applicantId, setApplicantId] = useState<UploadedFile | null>(null);
  const [incomeProofs, setIncomeProofs] = useState<UploadedFile[]>([]);

  // ---- Rascunho no aparelho ------------------------------------------------
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const dr = JSON.parse(raw);
        if (dr && typeof dr === "object" && dr.f) {
          setF({ ...EMPTY_FLAT, ...dr.f, ssn: "" });
          if (Array.isArray(dr.occupants) && dr.occupants.length) {
            // Rascunho antigo não tem os campos de co-applicant.
            setOccupants(dr.occupants.map((o: Partial<OccRow>) => {
              const blank = emptyOcc();
              return { ...blank, ...o, co: { ...blank.co, ...(o.co ?? {}), ssn: "" } };
            }));
          }
          if (Array.isArray(dr.history) && dr.history.length) setHistory(dr.history);
          if (Array.isArray(dr.vehicles) && dr.vehicles.length) setVehicles(dr.vehicles);
          if (Array.isArray(dr.refs) && dr.refs.length) setRefs(dr.refs);
          if (dr.applicantId) setApplicantId(dr.applicantId);
          if (Array.isArray(dr.incomeProofs)) setIncomeProofs(dr.incomeProofs);
          if (dr.lang === "pt" || dr.lang === "en") setLang(dr.lang);
          setRestored(true);
        }
      }
    } catch {
      /* rascunho corrompido ou storage bloqueado — segue com o form vazio */
    }
    setDraftLoaded(true);
  }, []);
  useEffect(() => {
    if (!draftLoaded) return; // não sobrescrever o rascunho antes de restaurar
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ f: { ...f, ssn: "" }, occupants: occupants.map((o) => ({ ...o, co: { ...o.co, ssn: "" } })), history, vehicles, refs, applicantId, incomeProofs, lang })
      );
    } catch {
      /* storage cheio/bloqueado — sem rascunho, o form continua funcionando */
    }
  }, [draftLoaded, f, occupants, history, vehicles, refs, applicantId, incomeProofs, lang]);
  const startOver = () => {
    if (!confirm(d.startOverConfirm)) return;
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setF({ ...EMPTY_FLAT, signature_date: todayISO() });
    setOccupants([emptyOcc()]);
    setHistory([emptyHist("current"), emptyHist("previous")]);
    setVehicles([emptyVeh()]);
    setRefs([{ name: "", phone: "" }, { name: "", phone: "" }]);
    setApplicantId(null);
    setIncomeProofs([]);
    setRestored(false);
  };

  // ---- Pagamento ----------------------------------------------------------
  // NÃO cria PaymentIntent ao abrir a página (cada visita virava um pagamento
  // "Incomplete" de $103.30 no Stripe). O Payment Element monta em modo
  // deferido e o PaymentIntent só nasce no clique em Pagar, já validado.

  const yesNo = (v: "" | "yes" | "no"): boolean | null => (v === "" ? null : v === "yes");
  // Campo de renda em foco? (muda só a formatação enquanto digita)
  const [incomeTyping, setIncomeTyping] = useState(false);

  const numOrNull = (s: string): number | null => {
    const n = Number((s || "").replace(/[^0-9.]/g, ""));
    return s.trim() && Number.isFinite(n) ? n : null;
  };

  // Ocupante #1 = o próprio candidato. Só pede detalhes de outros ocupantes se 2+.
  const occCountLive = numOrNull(f.occupants_count);
  const showOtherOccupants = occCountLive != null && occCountLive >= 2;
  // Valem só os 18+ que responderam "sim" (quem desmarca o 18+ deixa de contar).
  const coOccupants = showOtherOccupants ? occupants.filter((o) => o.is_adult && o.co_applicant === "yes") : [];
  const coCount = coOccupants.length;
  const feeCents = applicationFeeCents(coCount);
  const baseCents = applicationBaseCents(coCount);

  // ---- Validation (tudo obrigatório) ---------------------------------------
  const validate = (): Set<string> => {
    const e = new Set<string>();
    const need = (key: string, v: string) => { if (!v.trim()) e.add(key); };
    const occCount = numOrNull(f.occupants_count);

    if (!f.rental_type) e.add("rental_type");
    need("lease_start", f.lease_start);
    if (!f.property_id) e.add("property_id");
    if (f.property_id === OTHER) need("property_other", f.property_other);

    need("full_name", f.full_name);
    if (!isDob(f.date_of_birth)) e.add("date_of_birth");

    if (f.has_ssn === "") e.add("has_ssn");
    else if (f.has_ssn === "yes") {
      if (!f.tax_id_type) e.add("tax_id_type");
      need("ssn", f.ssn);
    }
    else need("ssn_none_explanation", f.ssn_none_explanation);

    need("phone", f.phone);

    if (f.has_license === "") e.add("has_license");
    else if (f.has_license === "yes") {
      need("drivers_license", f.drivers_license);
      need("drivers_license_state", f.drivers_license_state);
    } else {
      if (!f.gov_id_type) e.add("gov_id_type");
      need("gov_id_number", f.gov_id_number);
    }

    need("email", f.email);
    if (f.email.trim() && !isEmail(f.email)) e.add("email");
    if (!applicantId) e.add("applicant_id_upload");

    need("occupants_count", f.occupants_count);
    // Ocupante #1 é o próprio candidato. Só exige detalhes de OUTROS ocupantes
    // quando o total for 2+. Se for 1, não precisa listar ninguém.
    if (occCount != null && occCount >= 2) {
      occupants.forEach((o, i) => {
        need(`occ_${i}_name`, o.name);
        if (!isDob(o.dob)) e.add(`occ_${i}_dob`);
        // Parentesco é OPCIONAL (Andrea 2026-10-30): aparece pra todo ocupante,
        // mas não trava o envio — e não se pede detalhe do "Other".
        if (o.is_adult) {
          need(`occ_${i}_email`, o.email);
          if (o.email.trim() && !isEmail(o.email)) e.add(`occ_${i}_email`);
          need(`occ_${i}_phone`, o.phone);
          if (o.phone.trim() && f.phone.trim() && digits(o.phone) === digits(f.phone)) e.add(`occ_${i}_phone_dup`);
          if (!o.idFile) e.add(`occ_${i}_id`);
          if (o.co_applicant === "") e.add(`occ_${i}_co`);
          else if (o.co_applicant === "yes") validateCo(o.co, `co_${i}_`, e);
        }
      });
    }

    history.forEach((h, i) => {
      if (h.kind === "previous" && tenPlus) return;
      need(`hist_${i}_street`, h.street);
      need(`hist_${i}_city`, h.city);
      need(`hist_${i}_state`, h.state);
      need(`hist_${i}_zip`, h.zip);
      need(`hist_${i}_dur`, h.duration);
      need(`hist_${i}_lname`, h.landlord_name);
      need(`hist_${i}_lphone`, h.landlord_phone);
    });

    vehicles.forEach((v, i) => {
      if (!vehicleStarted(v)) return;
      need(`veh_${i}_mm`, v.make_model);
      need(`veh_${i}_year`, v.year);
      need(`veh_${i}_color`, v.color);
      need(`veh_${i}_plate`, v.plate);
      need(`veh_${i}_state`, v.plate_state);
    });

    if (!f.employment_status) e.add("employment_status");
    else if (f.employment_status === "employed") {
      need("employer", f.employer);
      need("employer_address", f.employer_address);
      need("manager_name", f.manager_name);
      need("manager_phone", f.manager_phone);
      need("job_title", f.job_title);
      need("monthly_income", f.monthly_income);
      need("length_of_employment", f.length_of_employment);
    } else if (f.employment_status === "self_employed") {
      need("business_name", f.business_name);
      need("business_type", f.business_type);
      need("length_of_employment", f.length_of_employment);
      need("monthly_income", f.monthly_income);
      if (incomeProofs.length === 0) e.add("income_proof");
    } else {
      if (f.retirement_income_sources.length === 0) e.add("retirement_income_sources");
      need("monthly_income", f.monthly_income);
      need("retired_since", f.retired_since);
      if (incomeProofs.length === 0) e.add("income_proof");
    }

    refs.forEach((r, i) => { need(`ref_${i}_name`, r.name); need(`ref_${i}_phone`, r.phone); });

    (["evicted", "felony", "bankruptcy", "smokes", "has_pets"] as const).forEach((k) => {
      if (f[k] === "") e.add(k);
    });
    if (f.evicted === "yes") need("evicted_detail", f.evicted_detail);
    if (f.felony === "yes") need("felony_detail", f.felony_detail);
    if (f.bankruptcy === "yes") need("bankruptcy_detail", f.bankruptcy_detail);
    if (f.has_pets === "yes") need("pets_detail", f.pets_detail);
    need("reason_for_moving", f.reason_for_moving);

    if (!f.consent_agreed) e.add("consent");
    need("signature_name", f.signature_name);
    need("signature_date", f.signature_date);

    return e;
  };

  const buildPayload = (): Omit<ApplicationInput, "stripe_payment_intent_id"> => {
    const isOther = f.property_id === OTHER;
    const attachments: AttachmentInput[] = [];
    if (applicantId)
      attachments.push({
        file_path: applicantId.path, category: "applicant_id", occupant_index: null,
        label: f.full_name.trim() || null, file_name: applicantId.file_name, content_type: applicantId.content_type,
      });
    const empStatus = f.employment_status;
    if (empStatus === "self_employed" || empStatus === "retired")
      incomeProofs.forEach((pf) =>
        attachments.push({
          file_path: pf.path, category: "income_proof", occupant_index: null,
          label: null, file_name: pf.file_name, content_type: pf.content_type,
        })
      );
    occupants.forEach((o, i) => {
      if (o.idFile)
        attachments.push({
          file_path: o.idFile.path, category: "occupant_id", occupant_index: i,
          label: o.name.trim() || null, file_name: o.idFile.file_name, content_type: o.idFile.content_type,
        });
    });

    return {
      language: lang,
      rental_type: f.rental_type || null,
      lease_start: f.lease_start || null,
      property_id: isOther || !f.property_id ? null : f.property_id,
      property_other: isOther ? f.property_other.trim() || null : null,

      full_name: f.full_name.trim(),
      date_of_birth: f.date_of_birth || null,

      has_ssn: f.has_ssn === "yes",
      tax_id_type: f.has_ssn === "yes" ? (f.tax_id_type || null) : null,
      ssn: f.has_ssn === "yes" ? f.ssn.trim() || null : null,
      ssn_none_explanation: f.has_ssn === "no" ? f.ssn_none_explanation.trim() || null : null,

      phone: f.phone.trim() || null,

      has_license: f.has_license === "yes",
      drivers_license: f.has_license === "yes" ? f.drivers_license.trim() || null : null,
      drivers_license_state: f.has_license === "yes" ? f.drivers_license_state.trim() || null : null,
      gov_id_type: f.has_license === "no" ? (f.gov_id_type || null) : null,
      gov_id_number: f.has_license === "no" ? f.gov_id_number.trim() || null : null,

      email: f.email.trim() || null,

      occupants_count: numOrNull(f.occupants_count),
      // Só envia outros ocupantes quando o total é 2+ (o #1 é o próprio candidato).
      occupants:
        (numOrNull(f.occupants_count) ?? 0) >= 2
          ? occupants.map((o) => ({ name: o.name, dob: o.dob, is_adult: o.is_adult, phone: o.phone, email: o.email.trim(), relationship: o.relationship, co_applicant: o.is_adult && o.co_applicant === "yes" }))
          : [],
      // 10+ anos no endereço atual: o anterior não é pedido nem enviado.
      rental_history: tenPlus ? history.filter((h) => h.kind === "current") : history,
      vehicles,

      // Só manda os campos do status escolhido (troca de status não vaza
      // resto de outro ramo pro banco).
      employment_status: f.employment_status || null,
      retirement_income_sources: f.employment_status === "retired" ? f.retirement_income_sources : null,
      retired_since: f.employment_status === "retired" ? f.retired_since.trim() || null : null,
      business_name: f.employment_status === "self_employed" ? f.business_name.trim() || null : null,
      business_type: f.employment_status === "self_employed" ? f.business_type.trim() || null : null,
      employer: f.employment_status === "employed" ? f.employer.trim() || null : null,
      employer_address: f.employment_status === "employed" ? f.employer_address.trim() || null : null,
      manager_name: f.employment_status === "employed" ? f.manager_name.trim() || null : null,
      manager_phone: f.employment_status === "employed" ? f.manager_phone.trim() || null : null,
      job_title: f.employment_status === "employed" ? f.job_title.trim() || null : null,
      // O campo já está em dólares ("5000" / "5000.50").
      monthly_income: numOrNull(f.monthly_income),
      length_of_employment: f.employment_status !== "retired" ? f.length_of_employment.trim() || null : null,

      personal_references: refs,

      evicted: yesNo(f.evicted), evicted_detail: f.evicted_detail.trim() || null,
      felony: yesNo(f.felony), felony_detail: f.felony_detail.trim() || null,
      bankruptcy: yesNo(f.bankruptcy), bankruptcy_detail: f.bankruptcy_detail.trim() || null,
      smokes: yesNo(f.smokes), has_pets: yesNo(f.has_pets), pets_detail: f.pets_detail.trim() || null,
      reason_for_moving: f.reason_for_moving.trim() || null,

      consent_agreed: f.consent_agreed,
      signature_name: f.signature_name.trim() || null,
      signature_date: f.signature_date || null,
      signature_name_2: f.signature_name_2.trim() || null,
      signature_date_2: f.signature_date_2 || null,

      attachments,

      co_applicants: coOccupants.map(buildCo),
    };
  };

  const [errs, setErrs] = useState<Set<string>>(new Set());
  const E = (key: string) => (errs.has(key) ? " !border-red-400 ring-2 ring-red-200" : "");

  const appearance = useMemo(
    () => ({ theme: "stripe" as const, variables: { colorPrimary: "#198577", colorText: "#0f1b19", borderRadius: "12px" } }),
    []
  );


  return (
    <div className="space-y-6">
      {/* idioma + intro */}
      <div className="glass p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="h-display text-xl text-ink">{d.title}</h2>
            <p className="mt-1 text-sm text-ink/60">{d.intro}</p>
          </div>
          <div className="flex shrink-0 rounded-xl border border-black/[0.08] p-0.5 text-sm">
            {(["en", "pt"] as Lang[]).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)}
                className={"rounded-lg px-3 py-1.5 font-semibold transition " + (lang === l ? "bg-primary text-white" : "text-ink/60 hover:text-ink")}>
                {l === "en" ? "EN" : "PT"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {restored && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3 text-sm text-ink/80">
          <span>{d.draftRestored}</span>
          <button type="button" onClick={startOver} className="shrink-0 font-semibold text-ink/55 underline hover:text-red-600">
            {d.startOver}
          </button>
        </div>
      )}

      {/* Propriedade */}
      <Section title={d.propertySection}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={d.rentalType} required>
            <select className={inputCls + E("rental_type")} value={f.rental_type} onChange={(e) => { set("rental_type", e.target.value as FlatState["rental_type"]); set("property_id", ""); }}>
              <option value="">{d.rentalTypePlaceholder}</option>
              <option value="year_round">{d.rentalTypeYearRound}</option>
              <option value="winter">{d.rentalTypeWinter}</option>
            </select>
          </Field>
          <Field label={d.leaseStart} required>
            <input type="date" className={inputCls + E("lease_start")} value={f.lease_start} onChange={(e) => set("lease_start", e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
        <Field label={d.propertyLabel} required>
          <select className={inputCls + E("property_id")} value={f.property_id} onChange={(e) => set("property_id", e.target.value)}>
            <option value="">{d.propertyPlaceholder}</option>
            {properties
              .filter((p) =>
                f.rental_type === "year_round"
                  ? p.accepts_year_round
                  : f.rental_type === "winter"
                    ? p.accepts_winter
                    : true
              )
              .map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            <option value={OTHER}>{d.propertyOther}</option>
          </select>
        </Field>
        </div>
        {f.property_id === OTHER && (
          <div className="mt-4"><Field label={d.propertyOtherLabel} required>
            <input className={inputCls + E("property_other")} value={f.property_other} onChange={(e) => set("property_other", e.target.value)} />
          </Field></div>
        )}
      </Section>

      {/* Candidato */}
      <Section title={d.applicantSection}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={d.fullName} required>
            <input className={inputCls + E("full_name")} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </Field>
          <Field label={d.dob} required>
            <input className={inputCls + E("date_of_birth")} placeholder="MM/DD/YYYY" inputMode="numeric" value={f.date_of_birth} onChange={(e) => set("date_of_birth", formatDob(e.target.value))} />
          </Field>
        </div>

        {/* SSN branch */}
        <div className="mt-4">
          <YesNo label={d.ssnQuestion} value={f.has_ssn} onChange={(v) => set("has_ssn", v)} yes={d.yesShort} no={d.noShort} err={errs.has("has_ssn")} />
          {f.has_ssn === "yes" && (
            <div className="mt-3 space-y-3">
              <TaxIdType dict={d} value={f.tax_id_type} onChange={(v) => set("tax_id_type", v)} err={errs.has("tax_id_type")} />
              {f.tax_id_type && (
                <Field label={f.tax_id_type === "itin" ? d.taxIdItin : d.taxIdSsn} hint={d.ssnHint} required>
                  <input type="password" className={inputCls + E("ssn")} inputMode="numeric" autoComplete="off" value={f.ssn} onChange={(e) => set("ssn", e.target.value)} />
                </Field>
              )}
            </div>
          )}
          {f.has_ssn === "no" && (
            <div className="mt-3"><Field label={d.ssnNoneExplain} required>
              <textarea className={inputCls + " min-h-[60px]" + E("ssn_none_explanation")} value={f.ssn_none_explanation} onChange={(e) => set("ssn_none_explanation", e.target.value)} />
            </Field></div>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={d.phone} required>
            <input className={inputCls + E("phone")} inputMode="tel" value={f.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} />
          </Field>
          <Field label={d.email} required>
            <input className={inputCls + E("email")} inputMode="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
        </div>

        {/* License branch */}
        <div className="mt-4">
          <YesNo label={d.licenseQuestion} value={f.has_license} onChange={(v) => set("has_license", v)} yes={d.yesShort} no={d.noShort} err={errs.has("has_license")} />
          {f.has_license === "yes" && (
            <div className="mt-3"><Field label={d.license} required>
              <div className="flex gap-2">
                <input className={inputCls + E("drivers_license")} value={f.drivers_license} onChange={(e) => set("drivers_license", e.target.value)} />
                <input className={inputCls + " w-20" + E("drivers_license_state")} placeholder="ST" maxLength={2} value={f.drivers_license_state} onChange={(e) => set("drivers_license_state", e.target.value.toUpperCase())} />
              </div>
            </Field></div>
          )}
          {f.has_license === "no" && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label={d.govIdType} required>
                <select className={inputCls + E("gov_id_type")} value={f.gov_id_type} onChange={(e) => set("gov_id_type", e.target.value as FlatState["gov_id_type"])}>
                  <option value="">—</option>
                  <option value="state_id">{d.govIdStateId}</option>
                  <option value="passport">{d.govIdPassport}</option>
                </select>
              </Field>
              <Field label={d.govIdNumber} required>
                <input className={inputCls + E("gov_id_number")} value={f.gov_id_number} onChange={(e) => set("gov_id_number", e.target.value)} />
              </Field>
            </div>
          )}
        </div>

        {/* Applicant ID upload */}
        <div className="mt-4">
          <IdUpload label={d.idUploadApplicant} hint={d.idUploadHint} dict={d} file={applicantId} onChange={setApplicantId} error={errs.has("applicant_id_upload")} />
        </div>
      </Section>

      {/* Ocupantes */}
      <Section title={d.occupantsSection} hint={d.occupantsNote}>
        <Field label={d.occupantsCount} required>
          <input className={inputCls + " sm:w-32" + E("occupants_count")} inputMode="numeric" value={f.occupants_count} onChange={(e) => set("occupants_count", e.target.value)} />
        </Field>
        {occCountLive === 1 && <p className="mt-3 text-sm text-ink/55">{d.occupantsSolo}</p>}
        {showOtherOccupants && (
        <>
        <div className="mt-3 space-y-4">
          {occupants.map((o, i) => (
            <div key={i} className="rounded-xl border border-black/[0.06] bg-page/60 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={d.occName} required>
                  <input className={inputCls + E(`occ_${i}_name`)} value={o.name} onChange={(e) => setOccupants(upd(occupants, i, { name: e.target.value }))} />
                </Field>
                <Field label={d.occDob} required>
                  <input className={inputCls + E(`occ_${i}_dob`)} placeholder="MM/DD/YYYY" inputMode="numeric" value={o.dob} onChange={(e) => setOccupants(upd(occupants, i, { dob: formatDob(e.target.value) }))} />
                </Field>
              </div>
              <div className="mt-3">
                <Field label={d.occRelationship}>
                  <select className={inputCls} value={o.relationship} onChange={(e) => setOccupants(upd(occupants, i, { relationship: e.target.value }))}>
                    <option value="">—</option>
                    {d.relOptions.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm text-ink/80">
                <input type="checkbox" className="h-4 w-4 accent-[#198577]" checked={o.is_adult} onChange={(e) => setOccupants(upd(occupants, i, { is_adult: e.target.checked }))} />
                {d.occAdult}
              </label>
              {o.is_adult && (
                <div className="mt-3 space-y-3">
                  <div>
                    <YesNo label={d.occCoQuestion} value={o.co_applicant} onChange={(v) => setOccupants(upd(occupants, i, { co_applicant: v }))} yes={d.yesShort} no={d.noShort} err={errs.has(`occ_${i}_co`)} />
                    <span className="mt-1 block text-xs text-ink/45">{d.occCoHint}</span>
                  </div>
                  <Field label={d.occEmail} required>
                    <input className={inputCls + E(`occ_${i}_email`)} inputMode="email" value={o.email} onChange={(e) => setOccupants(upd(occupants, i, { email: e.target.value }))} />
                  </Field>
                  <Field label={d.occPhone} required>
                    <input className={inputCls + E(`occ_${i}_phone`) + (errs.has(`occ_${i}_phone_dup`) ? " !border-red-400 ring-2 ring-red-200" : "")}
                      inputMode="tel" value={o.phone} onChange={(e) => setOccupants(upd(occupants, i, { phone: formatPhone(e.target.value) }))} />
                    {errs.has(`occ_${i}_phone_dup`) && <span className="mt-1 block text-xs text-red-500">{d.occPhone}</span>}
                  </Field>
                  <IdUpload label={d.idUploadOccupant} hint={d.idUploadHint} dict={d} file={o.idFile} onChange={(uf) => setOccupants(upd(occupants, i, { idFile: uf }))} error={errs.has(`occ_${i}_id`)} />
                </div>
              )}
              {occupants.length > 1 && (
                <button type="button" className="mt-3 text-sm text-ink/50 hover:text-red-600" onClick={() => setOccupants(occupants.filter((_, j) => j !== i))}>
                  {d.remove}
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className={addCls} onClick={() => setOccupants([...occupants, emptyOcc()])}>
          {d.addOccupant}
        </button>
        </>
        )}
      </Section>

      {/* Histórico de aluguel — todos obrigatórios */}
      <Section title={`${d.primaryLabel}: ${d.historySection}`} hint={d.historyHint}>
        <div className="space-y-4">
          {history.map((h, i) => h.kind === "previous" && tenPlus ? null : (
            <div key={i} className="rounded-xl border border-black/[0.06] bg-page/60 p-4">
              <p className="mb-3 text-sm font-semibold text-primary">
                {h.kind === "current" ? d.current : d.previous}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={d.street} required><input className={inputCls + E(`hist_${i}_street`)} value={h.street} onChange={(e) => setHistory(upd(history, i, { street: e.target.value }))} /></Field>
                <Field label={d.city} required><input className={inputCls + E(`hist_${i}_city`)} value={h.city} onChange={(e) => setHistory(upd(history, i, { city: e.target.value }))} /></Field>
                <Field label={`${d.stateLabel} / ${d.zip}`} required>
                  <div className="flex gap-2">
                    <input className={inputCls + " w-20" + E(`hist_${i}_state`)} placeholder="ST" maxLength={2} value={h.state} onChange={(e) => setHistory(upd(history, i, { state: e.target.value.toUpperCase() }))} />
                    <input className={inputCls + E(`hist_${i}_zip`)} inputMode="numeric" value={h.zip} onChange={(e) => setHistory(upd(history, i, { zip: e.target.value }))} />
                  </div>
                </Field>
                <Field label={d.howLong} required><input className={inputCls + E(`hist_${i}_dur`)} value={h.duration} onChange={(e) => setHistory(upd(history, i, { duration: e.target.value, ...(h.kind === "current" && !longStayTyped(e.target.value) ? { ten_plus_years: false } : {}) }))} /></Field>
                <Field label={d.landlordName} required><input className={inputCls + E(`hist_${i}_lname`)} value={h.landlord_name} onChange={(e) => setHistory(upd(history, i, { landlord_name: e.target.value }))} /></Field>
                <Field label={d.landlordPhone} required><input className={inputCls + E(`hist_${i}_lphone`)} inputMode="tel" value={h.landlord_phone} onChange={(e) => setHistory(upd(history, i, { landlord_phone: formatPhone(e.target.value) }))} /></Field>
              </div>
              {h.kind === "current" && longStayTyped(h.duration) && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-ink/80">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#198577]" checked={!!h.ten_plus_years} onChange={(e) => setHistory(upd(history, i, { ten_plus_years: e.target.checked }))} />
                  <span>{d.tenPlusYears}</span>
                </label>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Veículos — obrigatório */}
      <Section title={`${d.primaryLabel}: ${d.vehiclesSection}`} hint={d.vehiclesHint}>
        <div className="space-y-2">
          {vehicles.map((v, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr_1.2fr_0.8fr_auto]">
              <input className={inputCls + E(`veh_${i}_mm`)} placeholder={d.makeModel} value={v.make_model} onChange={(e) => setVehicles(upd(vehicles, i, { make_model: e.target.value }))} />
              <input className={inputCls + E(`veh_${i}_year`)} placeholder={d.year} value={v.year} onChange={(e) => setVehicles(upd(vehicles, i, { year: e.target.value }))} />
              <input className={inputCls + E(`veh_${i}_color`)} placeholder={d.color} value={v.color} onChange={(e) => setVehicles(upd(vehicles, i, { color: e.target.value }))} />
              <input className={inputCls + E(`veh_${i}_plate`)} placeholder={d.plate} value={v.plate} onChange={(e) => setVehicles(upd(vehicles, i, { plate: e.target.value }))} />
              <input className={inputCls + E(`veh_${i}_state`)} placeholder={d.plateState} maxLength={2} value={v.plate_state} onChange={(e) => setVehicles(upd(vehicles, i, { plate_state: e.target.value.toUpperCase() }))} />
              {vehicles.length > 1 && (
                <button type="button" className={removeCls} onClick={() => setVehicles(vehicles.filter((_, j) => j !== i))}>{d.remove}</button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className={addCls} onClick={() => setVehicles([...vehicles, emptyVeh()])}>{d.addVehicle}</button>
      </Section>

      {/* Emprego — status obrigatório; campos mudam por status */}
      <Section title={`${d.primaryLabel}: ${d.employmentSection}`}>
        <div className={"rounded-lg p-1" + (errs.has("employment_status") ? " bg-red-50" : "")}>
          <span className="mb-2 block text-sm font-medium text-ink/80">{d.employmentStatus}<span className="text-red-500"> *</span></span>
          <div className="flex flex-wrap gap-2">
            {(["employed", "self_employed", "retired"] as const).map((k) => (
              <button key={k} type="button" onClick={() => set("employment_status", k)}
                className={"rounded-lg border px-4 py-1.5 text-sm font-medium transition " +
                  (f.employment_status === k ? "border-primary bg-primary text-white" : "border-black/[0.1] text-ink/60 hover:border-primary/40")}>
                {k === "employed" ? d.empEmployed : k === "self_employed" ? d.empSelf : d.empRetired}
              </button>
            ))}
          </div>
        </div>

        {f.employment_status === "employed" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">

          <Field label={d.employer} required><input className={inputCls + E("employer")} value={f.employer} onChange={(e) => set("employer", e.target.value)} /></Field>
          <Field label={d.employerAddress} required><input className={inputCls + E("employer_address")} value={f.employer_address} onChange={(e) => set("employer_address", e.target.value)} /></Field>
          <Field label={d.managerName} required><input className={inputCls + E("manager_name")} value={f.manager_name} onChange={(e) => set("manager_name", e.target.value)} /></Field>
          <Field label={d.managerPhone} required><input className={inputCls + E("manager_phone")} inputMode="tel" value={f.manager_phone} onChange={(e) => set("manager_phone", formatPhone(e.target.value))} /></Field>
          <Field label={d.jobTitle} required><input className={inputCls + E("job_title")} value={f.job_title} onChange={(e) => set("job_title", e.target.value)} /></Field>
          <Field label={d.monthlyIncome} required><input className={inputCls + E("monthly_income")} inputMode="decimal" value={formatMoney(f.monthly_income, incomeTyping)} onFocus={() => setIncomeTyping(true)} onBlur={() => setIncomeTyping(false)} onChange={(e) => set("monthly_income", cleanMoney(e.target.value))} /></Field>
          <Field label={d.lengthEmployment} required><input className={inputCls + E("length_of_employment")} value={f.length_of_employment} onChange={(e) => set("length_of_employment", e.target.value)} /></Field>
        </div>
        )}

        {f.employment_status === "self_employed" && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={d.businessName} required><input className={inputCls + E("business_name")} value={f.business_name} onChange={(e) => set("business_name", e.target.value)} /></Field>
              <Field label={d.businessType} required><input className={inputCls + E("business_type")} value={f.business_type} onChange={(e) => set("business_type", e.target.value)} /></Field>
              <Field label={d.selfSince} required><input className={inputCls + E("length_of_employment")} value={f.length_of_employment} onChange={(e) => set("length_of_employment", e.target.value)} /></Field>
              <Field label={d.selfMonthlyIncome} required><input className={inputCls + E("monthly_income")} inputMode="decimal" value={formatMoney(f.monthly_income, incomeTyping)} onFocus={() => setIncomeTyping(true)} onBlur={() => setIncomeTyping(false)} onChange={(e) => set("monthly_income", cleanMoney(e.target.value))} /></Field>
            </div>
            <IncomeProofUpload dict={d} hint={d.incomeProofHintSelf} files={incomeProofs} onChange={setIncomeProofs} error={errs.has("income_proof")} />
          </div>
        )}

        {f.employment_status === "retired" && (
          <div className="mt-4 space-y-4">
            <div className={"rounded-lg p-1" + (errs.has("retirement_income_sources") ? " bg-red-50" : "")}>
              <span className="mb-2 block text-sm font-medium text-ink/80">{d.retireSources}<span className="text-red-500"> *</span></span>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {RETIRE_SOURCES.map((src) => (
                  <label key={src} className="flex cursor-pointer items-center gap-2 text-sm text-ink/80">
                    <input type="checkbox" className="h-4 w-4 accent-[#198577]"
                      checked={f.retirement_income_sources.includes(src)}
                      onChange={(e) => set("retirement_income_sources", e.target.checked
                        ? [...f.retirement_income_sources, src]
                        : f.retirement_income_sources.filter((x) => x !== src))} />
                    {src === "social_security" ? d.srcSocialSecurity : src === "pension" ? d.srcPension : src === "retirement_account" ? d.srcRetirementAccount : src === "annuity" ? d.srcAnnuity : d.srcOther}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={d.retireMonthlyIncome} required><input className={inputCls + E("monthly_income")} inputMode="decimal" value={formatMoney(f.monthly_income, incomeTyping)} onFocus={() => setIncomeTyping(true)} onBlur={() => setIncomeTyping(false)} onChange={(e) => set("monthly_income", cleanMoney(e.target.value))} /></Field>
              <Field label={d.retiredSince} required><input className={inputCls + E("retired_since")} inputMode="numeric" maxLength={4} placeholder="2019" value={f.retired_since} onChange={(e) => set("retired_since", e.target.value.replace(/\D/g, ""))} /></Field>
            </div>
            <IncomeProofUpload dict={d} hint={d.incomeProofHintRetired} files={incomeProofs} onChange={setIncomeProofs} error={errs.has("income_proof")} />
          </div>
        )}
      </Section>

      {/* Referências — ambas obrigatórias */}
      <Section title={`${d.primaryLabel}: ${d.referencesSection}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          {refs.map((r, i) => (
            <div key={i} className="rounded-xl border border-black/[0.06] bg-page/60 p-4">
              <p className="mb-3 text-sm font-semibold text-primary">{i === 0 ? d.ref1 : d.ref2}</p>
              <Field label={d.refName} required><input className={inputCls + E(`ref_${i}_name`)} value={r.name} onChange={(e) => setRefs(upd(refs, i, { name: e.target.value }))} /></Field>
              <div className="mt-3"><Field label={d.refPhone} required><input className={inputCls + E(`ref_${i}_phone`)} inputMode="tel" value={r.phone} onChange={(e) => setRefs(upd(refs, i, { phone: formatPhone(e.target.value) }))} /></Field></div>
            </div>
          ))}
        </div>
      </Section>

      {/* Adicionais */}
      <Section title={`${d.primaryLabel}: ${d.additionalSection}`}>
        <div className="space-y-4">
          <YesNo label={d.evicted} value={f.evicted} onChange={(v) => set("evicted", v)} yes={d.yes} no={d.no} err={errs.has("evicted")} />
          {f.evicted === "yes" && <input className={inputCls + E("evicted_detail")} placeholder={d.ifYesWhen} value={f.evicted_detail} onChange={(e) => set("evicted_detail", e.target.value)} />}
          <YesNo label={d.felony} value={f.felony} onChange={(v) => set("felony", v)} yes={d.yes} no={d.no} err={errs.has("felony")} />
          {f.felony === "yes" && <input className={inputCls + E("felony_detail")} placeholder={d.ifYesWhen} value={f.felony_detail} onChange={(e) => set("felony_detail", e.target.value)} />}
          <YesNo label={d.bankruptcy} value={f.bankruptcy} onChange={(v) => set("bankruptcy", v)} yes={d.yes} no={d.no} err={errs.has("bankruptcy")} />
          {f.bankruptcy === "yes" && <input className={inputCls + E("bankruptcy_detail")} placeholder={d.ifYesWhen} value={f.bankruptcy_detail} onChange={(e) => set("bankruptcy_detail", e.target.value)} />}
          <YesNo label={d.smoke} value={f.smokes} onChange={(v) => set("smokes", v)} yes={d.yes} no={d.no} err={errs.has("smokes")} />
          <YesNo label={d.pets} value={f.has_pets} onChange={(v) => set("has_pets", v)} yes={d.yes} no={d.no} err={errs.has("has_pets")} />
          {f.has_pets === "yes" && <input className={inputCls + E("pets_detail")} placeholder={d.petsList} value={f.pets_detail} onChange={(e) => set("pets_detail", e.target.value)} />}
          <Field label={d.reasonMoving} required>
            <textarea className={inputCls + " min-h-[70px]" + E("reason_for_moving")} value={f.reason_for_moving} onChange={(e) => set("reason_for_moving", e.target.value)} />
          </Field>
        </div>
      </Section>

      {/* Consentimento */}
      <Section title={`${d.primaryLabel}: ${d.consentSection}`}>
        <p className="whitespace-pre-line text-xs leading-relaxed text-ink/70">{d.consentText}</p>
        <label className={"mt-4 flex cursor-pointer items-start gap-3 rounded-xl p-2 text-sm text-ink" + (errs.has("consent") ? " bg-red-50" : "")}>
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[#198577]" checked={f.consent_agreed} onChange={(e) => set("consent_agreed", e.target.checked)} />
          <span>{d.consentCheckbox}</span>
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={d.signature} required><input className={inputCls + E("signature_name")} value={f.signature_name} onChange={(e) => set("signature_name", e.target.value)} /></Field>
          <Field label={d.date} required><input type="date" className={inputCls + E("signature_date")} value={f.signature_date} onChange={(e) => set("signature_date", e.target.value)} /></Field>
        </div>
      </Section>

      {/* Co-applicants: uma seção completa pra cada ocupante 18+ marcado "sim" */}
      {showOtherOccupants && occupants.map((o, i) => o.is_adult && o.co_applicant === "yes" ? (
        <CoApplicantSection
          key={i}
          dict={d}
          name={o.name}
          co={o.co}
          onChange={(patch) => setOccupants((prev) => upd(prev, i, { co: { ...prev[i].co, ...patch } }))}
          errs={errs}
          prefix={`co_${i}_`}
        />
      ) : null)}

      {/* Pagamento + envio */}
      <Section title={d.feeSection}>
        <p className="text-sm text-ink/70">{d.feeText}</p>
        <dl className="mt-3 space-y-1 rounded-xl border border-black/[0.06] bg-page/60 p-4 text-sm text-ink/75">
          <div className="flex justify-between gap-3"><dt>{d.feeBase}</dt><dd>{dollars(10000)}</dd></div>
          {coCount > 0 && <div className="flex justify-between gap-3"><dt>{d.feeCo} × {coCount}</dt><dd>{dollars(5000 * coCount)}</dd></div>}
          <div className="flex justify-between gap-3"><dt>{d.feeProcessing}</dt><dd>{dollars(feeCents - baseCents)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-black/[0.08] pt-1.5 font-semibold text-ink"><dt>{d.feeTotal}</dt><dd>{dollars(feeCents)}</dd></div>
        </dl>
        {!stripePromise && <p className="mt-3 text-sm text-red-600">Payment is not configured yet. Please call (508) 364-8556.</p>}
        {stripePromise && (
          <Elements stripe={stripePromise} options={{
            mode: "payment", amount: feeCents, currency: "usd",
            paymentMethodTypes: [...APPLICATION_PAYMENT_METHODS], appearance,
          }}>
            <PaymentSubmit dict={d} getPayload={buildPayload} validate={validate} onErrors={setErrs} coCount={coCount} feeCents={feeCents} />
          </Elements>
        )}
      </Section>
    </div>
  );
}

// Mesmas regras do candidato, com as chaves prefixadas por co-applicant.
function validateCo(c: CoData, p: string, e: Set<string>) {
  const need = (key: string, v: string) => { if (!v.trim()) e.add(p + key); };
  if (c.has_ssn === "") e.add(p + "has_ssn");
  else if (c.has_ssn === "yes") {
    if (!c.tax_id_type) e.add(p + "tax_id_type");
    need("ssn", c.ssn);
  }
  else need("ssn_none_explanation", c.ssn_none_explanation);

  if (c.has_license === "") e.add(p + "has_license");
  else if (c.has_license === "yes") {
    need("drivers_license", c.drivers_license);
    need("drivers_license_state", c.drivers_license_state);
  } else {
    if (!c.gov_id_type) e.add(p + "gov_id_type");
    need("gov_id_number", c.gov_id_number);
  }

  const longStay = c.history.some((h) => h.kind === "current" && h.ten_plus_years);
  c.history.forEach((h, i) => {
    if (h.kind === "previous" && longStay) return;
    need(`hist_${i}_street`, h.street);
    need(`hist_${i}_city`, h.city);
    need(`hist_${i}_state`, h.state);
    need(`hist_${i}_zip`, h.zip);
    need(`hist_${i}_dur`, h.duration);
    need(`hist_${i}_lname`, h.landlord_name);
    need(`hist_${i}_lphone`, h.landlord_phone);
  });

  c.vehicles.forEach((v, i) => {
    if (!vehicleStarted(v)) return;
    need(`veh_${i}_mm`, v.make_model);
    need(`veh_${i}_year`, v.year);
    need(`veh_${i}_color`, v.color);
    need(`veh_${i}_plate`, v.plate);
    need(`veh_${i}_state`, v.plate_state);
  });

  if (!c.employment_status) e.add(p + "employment_status");
  else if (c.employment_status === "employed") {
    need("employer", c.employer);
    need("employer_address", c.employer_address);
    need("manager_name", c.manager_name);
    need("manager_phone", c.manager_phone);
    need("job_title", c.job_title);
    need("monthly_income", c.monthly_income);
    need("length_of_employment", c.length_of_employment);
  } else if (c.employment_status === "self_employed") {
    need("business_name", c.business_name);
    need("business_type", c.business_type);
    need("length_of_employment", c.length_of_employment);
    need("monthly_income", c.monthly_income);
    if (c.incomeProofs.length === 0) e.add(p + "income_proof");
  } else {
    if (c.retirement_income_sources.length === 0) e.add(p + "retirement_income_sources");
    need("monthly_income", c.monthly_income);
    need("retired_since", c.retired_since);
    if (c.incomeProofs.length === 0) e.add(p + "income_proof");
  }

  c.refs.forEach((r, i) => { need(`ref_${i}_name`, r.name); need(`ref_${i}_phone`, r.phone); });

  (["evicted", "felony", "bankruptcy", "smokes", "has_pets"] as const).forEach((k) => {
    if (c[k] === "") e.add(p + k);
  });
  if (c.evicted === "yes") need("evicted_detail", c.evicted_detail);
  if (c.felony === "yes") need("felony_detail", c.felony_detail);
  if (c.bankruptcy === "yes") need("bankruptcy_detail", c.bankruptcy_detail);
  if (c.has_pets === "yes") need("pets_detail", c.pets_detail);
  need("reason_for_moving", c.reason_for_moving);

  if (!c.consent_agreed) e.add(p + "consent");
  need("signature_name", c.signature_name);
  need("signature_date", c.signature_date);
}

// Payload de um co-applicant: identidade vem da linha do ocupante.
function buildCo(o: OccRow): CoApplicantInput {
  const c = o.co;
  const status = c.employment_status;
  const attachments: AttachmentInput[] = [];
  if (o.idFile)
    attachments.push({
      file_path: o.idFile.path, category: "applicant_id", occupant_index: null,
      label: o.name.trim() || null, file_name: o.idFile.file_name, content_type: o.idFile.content_type,
    });
  if (status === "self_employed" || status === "retired")
    c.incomeProofs.forEach((pf) =>
      attachments.push({
        file_path: pf.path, category: "income_proof", occupant_index: null,
        label: null, file_name: pf.file_name, content_type: pf.content_type,
      })
    );
  const yn = (v: "" | "yes" | "no"): boolean | null => (v === "" ? null : v === "yes");
  const n = Number((c.monthly_income || "").replace(/[^0-9.]/g, ""));
  const longStay = c.history.some((h) => h.kind === "current" && h.ten_plus_years);
  return {
    full_name: o.name.trim(),
    date_of_birth: o.dob || null,
    has_ssn: c.has_ssn === "yes",
    tax_id_type: c.has_ssn === "yes" ? (c.tax_id_type || null) : null,
    ssn: c.has_ssn === "yes" ? c.ssn.trim() || null : null,
    ssn_none_explanation: c.has_ssn === "no" ? c.ssn_none_explanation.trim() || null : null,
    phone: o.phone.trim() || null,
    has_license: c.has_license === "yes",
    drivers_license: c.has_license === "yes" ? c.drivers_license.trim() || null : null,
    drivers_license_state: c.has_license === "yes" ? c.drivers_license_state.trim() || null : null,
    gov_id_type: c.has_license === "no" ? (c.gov_id_type || null) : null,
    gov_id_number: c.has_license === "no" ? c.gov_id_number.trim() || null : null,
    email: o.email.trim() || null,
    rental_history: longStay ? c.history.filter((h) => h.kind === "current") : c.history,
    vehicles: c.vehicles,
    employment_status: status || null,
    retirement_income_sources: status === "retired" ? c.retirement_income_sources : null,
    retired_since: status === "retired" ? c.retired_since.trim() || null : null,
    business_name: status === "self_employed" ? c.business_name.trim() || null : null,
    business_type: status === "self_employed" ? c.business_type.trim() || null : null,
    employer: status === "employed" ? c.employer.trim() || null : null,
    employer_address: status === "employed" ? c.employer_address.trim() || null : null,
    manager_name: status === "employed" ? c.manager_name.trim() || null : null,
    manager_phone: status === "employed" ? c.manager_phone.trim() || null : null,
    job_title: status === "employed" ? c.job_title.trim() || null : null,
    monthly_income: c.monthly_income.trim() && Number.isFinite(n) ? n : null,
    length_of_employment: status !== "retired" ? c.length_of_employment.trim() || null : null,
    personal_references: c.refs,
    evicted: yn(c.evicted), evicted_detail: c.evicted_detail.trim() || null,
    felony: yn(c.felony), felony_detail: c.felony_detail.trim() || null,
    bankruptcy: yn(c.bankruptcy), bankruptcy_detail: c.bankruptcy_detail.trim() || null,
    smokes: yn(c.smokes), has_pets: yn(c.has_pets), pets_detail: c.pets_detail.trim() || null,
    reason_for_moving: c.reason_for_moving.trim() || null,
    consent_agreed: c.consent_agreed,
    signature_name: c.signature_name.trim() || null,
    signature_date: c.signature_date || null,
    attachments,
  };
}

// =============================================================================
// CoApplicantSection — mesmos campos do candidato, para um ocupante 18+.
// =============================================================================
function CoApplicantSection({
  dict: d, name, co: c, onChange, errs, prefix,
}: {
  dict: (typeof DICT)[Lang];
  name: string;
  co: CoData;
  onChange: (patch: Partial<CoData>) => void;
  errs: Set<string>;
  prefix: string;
}) {
  const [incomeTyping, setIncomeTyping] = useState(false);
  const who = name.trim() || d.coSection;
  const heading = (title: string) => `${d.coSection} (${who}): ${title}`;
  const E = (key: string) => (errs.has(prefix + key) ? " !border-red-400 ring-2 ring-red-200" : "");
  const has = (key: string) => errs.has(prefix + key);
  const longStay = c.history.some((h) => h.kind === "current" && h.ten_plus_years);
  const setHistory = (i: number, patch: Partial<HistoryInput>) => onChange({ history: upd(c.history, i, patch) });
  const setVehicle = (i: number, patch: Partial<VehicleInput>) => onChange({ vehicles: upd(c.vehicles, i, patch) });
  const setRef = (i: number, patch: Partial<ReferenceInput>) => onChange({ refs: upd(c.refs, i, patch) });
  const income = (label: string) => (
    <Field label={label} required>
      <input className={inputCls + E("monthly_income")} inputMode="decimal" value={formatMoney(c.monthly_income, incomeTyping)} onFocus={() => setIncomeTyping(true)} onBlur={() => setIncomeTyping(false)} onChange={(e) => onChange({ monthly_income: cleanMoney(e.target.value) })} />
    </Field>
  );

  return (
    <Section accent title={`${d.coSection}: ${who}`} hint={d.coHint.replaceAll("{name}", who)}>
      <div className="space-y-6">
        {/* SSN */}
        <div>
          <YesNo label={d.ssnQuestion} value={c.has_ssn} onChange={(v) => onChange({ has_ssn: v })} yes={d.yesShort} no={d.noShort} err={has("has_ssn")} />
          {c.has_ssn === "yes" && (
            <div className="mt-3 space-y-3">
              <TaxIdType dict={d} value={c.tax_id_type} onChange={(v) => onChange({ tax_id_type: v })} err={has("tax_id_type")} />
              {c.tax_id_type && (
                <Field label={c.tax_id_type === "itin" ? d.taxIdItin : d.taxIdSsn} hint={d.ssnHint} required>
                  <input type="password" className={inputCls + E("ssn")} inputMode="numeric" autoComplete="off" value={c.ssn} onChange={(e) => onChange({ ssn: e.target.value })} />
                </Field>
              )}
            </div>
          )}
          {c.has_ssn === "no" && (
            <div className="mt-3"><Field label={d.ssnNoneExplain} required>
              <textarea className={inputCls + " min-h-[60px]" + E("ssn_none_explanation")} value={c.ssn_none_explanation} onChange={(e) => onChange({ ssn_none_explanation: e.target.value })} />
            </Field></div>
          )}
        </div>

        {/* Licença */}
        <div>
          <YesNo label={d.licenseQuestion} value={c.has_license} onChange={(v) => onChange({ has_license: v })} yes={d.yesShort} no={d.noShort} err={has("has_license")} />
          {c.has_license === "yes" && (
            <div className="mt-3"><Field label={d.license} required>
              <div className="flex gap-2">
                <input className={inputCls + E("drivers_license")} value={c.drivers_license} onChange={(e) => onChange({ drivers_license: e.target.value })} />
                <input className={inputCls + " w-20" + E("drivers_license_state")} placeholder="ST" maxLength={2} value={c.drivers_license_state} onChange={(e) => onChange({ drivers_license_state: e.target.value.toUpperCase() })} />
              </div>
            </Field></div>
          )}
          {c.has_license === "no" && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label={d.govIdType} required>
                <select className={inputCls + E("gov_id_type")} value={c.gov_id_type} onChange={(e) => onChange({ gov_id_type: e.target.value as CoData["gov_id_type"] })}>
                  <option value="">—</option>
                  <option value="state_id">{d.govIdStateId}</option>
                  <option value="passport">{d.govIdPassport}</option>
                </select>
              </Field>
              <Field label={d.govIdNumber} required>
                <input className={inputCls + E("gov_id_number")} value={c.gov_id_number} onChange={(e) => onChange({ gov_id_number: e.target.value })} />
              </Field>
            </div>
          )}
        </div>

        {/* Histórico */}
        <div>
          <h4 className="h-display text-sm text-primary">{heading(d.historySection)}</h4>
          <p className="mt-1 text-xs text-ink/55">{d.historyHint}</p>
          <div className="mt-3 space-y-4">
            {c.history.map((h, i) => h.kind === "previous" && longStay ? null : (
              <div key={i} className="rounded-xl border border-black/[0.06] bg-page/60 p-4">
                <p className="mb-3 text-sm font-semibold text-primary">{h.kind === "current" ? d.current : d.previous}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={d.street} required><input className={inputCls + E(`hist_${i}_street`)} value={h.street} onChange={(e) => setHistory(i, { street: e.target.value })} /></Field>
                  <Field label={d.city} required><input className={inputCls + E(`hist_${i}_city`)} value={h.city} onChange={(e) => setHistory(i, { city: e.target.value })} /></Field>
                  <Field label={`${d.stateLabel} / ${d.zip}`} required>
                    <div className="flex gap-2">
                      <input className={inputCls + " w-20" + E(`hist_${i}_state`)} placeholder="ST" maxLength={2} value={h.state} onChange={(e) => setHistory(i, { state: e.target.value.toUpperCase() })} />
                      <input className={inputCls + E(`hist_${i}_zip`)} inputMode="numeric" value={h.zip} onChange={(e) => setHistory(i, { zip: e.target.value })} />
                    </div>
                  </Field>
                  <Field label={d.howLong} required><input className={inputCls + E(`hist_${i}_dur`)} value={h.duration} onChange={(e) => setHistory(i, { duration: e.target.value, ...(h.kind === "current" && !longStayTyped(e.target.value) ? { ten_plus_years: false } : {}) })} /></Field>
                  <Field label={d.landlordName} required><input className={inputCls + E(`hist_${i}_lname`)} value={h.landlord_name} onChange={(e) => setHistory(i, { landlord_name: e.target.value })} /></Field>
                  <Field label={d.landlordPhone} required><input className={inputCls + E(`hist_${i}_lphone`)} inputMode="tel" value={h.landlord_phone} onChange={(e) => setHistory(i, { landlord_phone: formatPhone(e.target.value) })} /></Field>
                </div>
                {h.kind === "current" && longStayTyped(h.duration) && (
                  <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-ink/80">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#198577]" checked={!!h.ten_plus_years} onChange={(e) => setHistory(i, { ten_plus_years: e.target.checked })} />
                    <span>{d.tenPlusYears}</span>
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Veículos */}
        <div>
          <h4 className="h-display text-sm text-primary">{heading(d.vehiclesSection)}</h4>
          <p className="mt-1 text-xs text-ink/55">{d.vehiclesHint}</p>
          <div className="mt-3 space-y-2">
            {c.vehicles.map((v, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr_1.2fr_0.8fr_auto]">
                <input className={inputCls + E(`veh_${i}_mm`)} placeholder={d.makeModel} value={v.make_model} onChange={(e) => setVehicle(i, { make_model: e.target.value })} />
                <input className={inputCls + E(`veh_${i}_year`)} placeholder={d.year} value={v.year} onChange={(e) => setVehicle(i, { year: e.target.value })} />
                <input className={inputCls + E(`veh_${i}_color`)} placeholder={d.color} value={v.color} onChange={(e) => setVehicle(i, { color: e.target.value })} />
                <input className={inputCls + E(`veh_${i}_plate`)} placeholder={d.plate} value={v.plate} onChange={(e) => setVehicle(i, { plate: e.target.value })} />
                <input className={inputCls + E(`veh_${i}_state`)} placeholder={d.plateState} maxLength={2} value={v.plate_state} onChange={(e) => setVehicle(i, { plate_state: e.target.value.toUpperCase() })} />
                {c.vehicles.length > 1 && (
                  <button type="button" className={removeCls} onClick={() => onChange({ vehicles: c.vehicles.filter((_, j) => j !== i) })}>{d.remove}</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className={addCls} onClick={() => onChange({ vehicles: [...c.vehicles, emptyVeh()] })}>{d.addVehicle}</button>
        </div>

        {/* Emprego */}
        <div>
          <h4 className="h-display text-sm text-primary">{heading(d.employmentSection)}</h4>
          <div className={"mt-3 rounded-lg p-1" + (has("employment_status") ? " bg-red-50" : "")}>
            <span className="mb-2 block text-sm font-medium text-ink/80">{d.employmentStatus}<span className="text-red-500"> *</span></span>
            <div className="flex flex-wrap gap-2">
              {(["employed", "self_employed", "retired"] as const).map((k) => (
                <button key={k} type="button" onClick={() => onChange({ employment_status: k })}
                  className={"rounded-lg border px-4 py-1.5 text-sm font-medium transition " +
                    (c.employment_status === k ? "border-primary bg-primary text-white" : "border-black/[0.1] text-ink/60 hover:border-primary/40")}>
                  {k === "employed" ? d.empEmployed : k === "self_employed" ? d.empSelf : d.empRetired}
                </button>
              ))}
            </div>
          </div>

          {c.employment_status === "employed" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={d.employer} required><input className={inputCls + E("employer")} value={c.employer} onChange={(e) => onChange({ employer: e.target.value })} /></Field>
              <Field label={d.employerAddress} required><input className={inputCls + E("employer_address")} value={c.employer_address} onChange={(e) => onChange({ employer_address: e.target.value })} /></Field>
              <Field label={d.managerName} required><input className={inputCls + E("manager_name")} value={c.manager_name} onChange={(e) => onChange({ manager_name: e.target.value })} /></Field>
              <Field label={d.managerPhone} required><input className={inputCls + E("manager_phone")} inputMode="tel" value={c.manager_phone} onChange={(e) => onChange({ manager_phone: formatPhone(e.target.value) })} /></Field>
              <Field label={d.jobTitle} required><input className={inputCls + E("job_title")} value={c.job_title} onChange={(e) => onChange({ job_title: e.target.value })} /></Field>
              {income(d.monthlyIncome)}
              <Field label={d.lengthEmployment} required><input className={inputCls + E("length_of_employment")} value={c.length_of_employment} onChange={(e) => onChange({ length_of_employment: e.target.value })} /></Field>
            </div>
          )}

          {c.employment_status === "self_employed" && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={d.businessName} required><input className={inputCls + E("business_name")} value={c.business_name} onChange={(e) => onChange({ business_name: e.target.value })} /></Field>
                <Field label={d.businessType} required><input className={inputCls + E("business_type")} value={c.business_type} onChange={(e) => onChange({ business_type: e.target.value })} /></Field>
                <Field label={d.selfSince} required><input className={inputCls + E("length_of_employment")} value={c.length_of_employment} onChange={(e) => onChange({ length_of_employment: e.target.value })} /></Field>
                {income(d.selfMonthlyIncome)}
              </div>
              <IncomeProofUpload dict={d} hint={d.incomeProofHintSelf} files={c.incomeProofs} onChange={(files) => onChange({ incomeProofs: files })} error={has("income_proof")} />
            </div>
          )}

          {c.employment_status === "retired" && (
            <div className="mt-4 space-y-4">
              <div className={"rounded-lg p-1" + (has("retirement_income_sources") ? " bg-red-50" : "")}>
                <span className="mb-2 block text-sm font-medium text-ink/80">{d.retireSources}<span className="text-red-500"> *</span></span>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {RETIRE_SOURCES.map((src) => (
                    <label key={src} className="flex cursor-pointer items-center gap-2 text-sm text-ink/80">
                      <input type="checkbox" className="h-4 w-4 accent-[#198577]"
                        checked={c.retirement_income_sources.includes(src)}
                        onChange={(e) => onChange({ retirement_income_sources: e.target.checked
                          ? [...c.retirement_income_sources, src]
                          : c.retirement_income_sources.filter((x) => x !== src) })} />
                      {src === "social_security" ? d.srcSocialSecurity : src === "pension" ? d.srcPension : src === "retirement_account" ? d.srcRetirementAccount : src === "annuity" ? d.srcAnnuity : d.srcOther}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {income(d.retireMonthlyIncome)}
                <Field label={d.retiredSince} required><input className={inputCls + E("retired_since")} inputMode="numeric" maxLength={4} placeholder="2019" value={c.retired_since} onChange={(e) => onChange({ retired_since: e.target.value.replace(/\D/g, "") })} /></Field>
              </div>
              <IncomeProofUpload dict={d} hint={d.incomeProofHintRetired} files={c.incomeProofs} onChange={(files) => onChange({ incomeProofs: files })} error={has("income_proof")} />
            </div>
          )}
        </div>

        {/* Referências */}
        <div>
          <h4 className="h-display text-sm text-primary">{heading(d.referencesSection)}</h4>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {c.refs.map((r, i) => (
              <div key={i} className="rounded-xl border border-black/[0.06] bg-page/60 p-4">
                <p className="mb-3 text-sm font-semibold text-primary">{i === 0 ? d.ref1 : d.ref2}</p>
                <Field label={d.refName} required><input className={inputCls + E(`ref_${i}_name`)} value={r.name} onChange={(e) => setRef(i, { name: e.target.value })} /></Field>
                <div className="mt-3"><Field label={d.refPhone} required><input className={inputCls + E(`ref_${i}_phone`)} inputMode="tel" value={r.phone} onChange={(e) => setRef(i, { phone: formatPhone(e.target.value) })} /></Field></div>
              </div>
            ))}
          </div>
        </div>

        {/* Adicionais */}
        <div>
          <h4 className="h-display text-sm text-primary">{heading(d.additionalSection)}</h4>
          <div className="mt-3 space-y-4">
            <YesNo label={d.evicted} value={c.evicted} onChange={(v) => onChange({ evicted: v })} yes={d.yes} no={d.no} err={has("evicted")} />
            {c.evicted === "yes" && <input className={inputCls + E("evicted_detail")} placeholder={d.ifYesWhen} value={c.evicted_detail} onChange={(e) => onChange({ evicted_detail: e.target.value })} />}
            <YesNo label={d.felony} value={c.felony} onChange={(v) => onChange({ felony: v })} yes={d.yes} no={d.no} err={has("felony")} />
            {c.felony === "yes" && <input className={inputCls + E("felony_detail")} placeholder={d.ifYesWhen} value={c.felony_detail} onChange={(e) => onChange({ felony_detail: e.target.value })} />}
            <YesNo label={d.bankruptcy} value={c.bankruptcy} onChange={(v) => onChange({ bankruptcy: v })} yes={d.yes} no={d.no} err={has("bankruptcy")} />
            {c.bankruptcy === "yes" && <input className={inputCls + E("bankruptcy_detail")} placeholder={d.ifYesWhen} value={c.bankruptcy_detail} onChange={(e) => onChange({ bankruptcy_detail: e.target.value })} />}
            <YesNo label={d.smoke} value={c.smokes} onChange={(v) => onChange({ smokes: v })} yes={d.yes} no={d.no} err={has("smokes")} />
            <YesNo label={d.pets} value={c.has_pets} onChange={(v) => onChange({ has_pets: v })} yes={d.yes} no={d.no} err={has("has_pets")} />
            {c.has_pets === "yes" && <input className={inputCls + E("pets_detail")} placeholder={d.petsList} value={c.pets_detail} onChange={(e) => onChange({ pets_detail: e.target.value })} />}
            <Field label={d.reasonMoving} required>
              <textarea className={inputCls + " min-h-[70px]" + E("reason_for_moving")} value={c.reason_for_moving} onChange={(e) => onChange({ reason_for_moving: e.target.value })} />
            </Field>
          </div>
        </div>

        {/* Consentimento + assinatura próprios */}
        <div>
          <h4 className="h-display text-sm text-primary">{heading(d.consentSection)}</h4>
          <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-ink/70">{d.consentText}</p>
          <label className={"mt-4 flex cursor-pointer items-start gap-3 rounded-xl p-2 text-sm text-ink" + (has("consent") ? " bg-red-50" : "")}>
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#198577]" checked={c.consent_agreed} onChange={(e) => onChange({ consent_agreed: e.target.checked })} />
            <span>{d.consentCheckbox}</span>
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={d.coSignature.replace("{name}", who)} required><input className={inputCls + E("signature_name")} value={c.signature_name} onChange={(e) => onChange({ signature_name: e.target.value })} /></Field>
            <Field label={d.date} required><input type="date" className={inputCls + E("signature_date")} value={c.signature_date} onChange={(e) => onChange({ signature_date: e.target.value })} /></Field>
          </div>
        </div>
      </div>
    </Section>
  );
}

// =============================================================================
// PaymentSubmit — dentro de <Elements> pra ter stripe/elements.
// =============================================================================
function PaymentSubmit({
  dict, getPayload, validate, onErrors, coCount, feeCents,
}: {
  dict: (typeof DICT)[Lang];
  getPayload: () => Omit<ApplicationInput, "stripe_payment_intent_id">;
  validate: () => Set<string>;
  onErrors: (e: Set<string>) => void;
  coCount: number;
  feeCents: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errRef = useRef<HTMLDivElement | null>(null);

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => errRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const onSubmit = async () => {
    setError(null);
    // 1) valida TUDO antes de cobrar
    const missing = validate();
    onErrors(missing);
    if (missing.size > 0) {
      showError(dict.fixErrors);
      setTimeout(() => document.querySelector(".\\!border-red-400")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
      return;
    }
    if (!stripe || !elements) return showError(dict.payFirst);

    setSubmitting(true);
    try {
      // 2) confere o cartão digitado; 3) só AGORA cria o PaymentIntent; 4) cobra
      const { error: cardErr } = await elements.submit();
      if (cardErr) { setSubmitting(false); return showError(cardErr.message || dict.errorGeneric); }
      const { clientSecret } = await createApplicationPaymentIntent(coCount);
      const { error: payErr, paymentIntent } = await stripe.confirmPayment({
        elements, clientSecret, redirect: "if_required",
        confirmParams: { return_url: window.location.origin + "/apply/thank-you" },
      });
      if (payErr) { setSubmitting(false); return showError(payErr.message || dict.errorGeneric); }
      if (!paymentIntent || paymentIntent.status !== "succeeded") { setSubmitting(false); return showError(dict.errorGeneric); }

      const res = await submitApplication({ ...getPayload(), stripe_payment_intent_id: paymentIntent.id });
      if (!res.ok) { setSubmitting(false); return showError(res.error || dict.errorGeneric); }
      try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      window.location.href = "/apply/thank-you";
    } catch (e) {
      setSubmitting(false);
      showError(e instanceof Error ? e.message : dict.errorGeneric);
    }
  };

  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-medium text-ink">{dict.cardLabel}</p>
      <div className="rounded-xl border border-black/[0.08] bg-white p-4"><PaymentElement /></div>
      {error && <div ref={errRef} className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <button type="button" onClick={onSubmit} disabled={submitting || !stripe}
        className="mt-5 w-full rounded-xl bg-primary px-5 py-3.5 text-center font-semibold text-white shadow-glow transition hover:brightness-110 disabled:opacity-60">
        {submitting ? dict.submitting : dict.submit.replace("{total}", dollars(feeCents))}
      </button>
    </div>
  );
}

// =============================================================================
// IdUpload — sobe uma foto/arquivo de government ID via signed upload URL.
// =============================================================================
function IdUpload({
  label, hint, dict, file, onChange, error,
}: {
  label: string;
  hint: string;
  dict: (typeof DICT)[Lang];
  file: UploadedFile | null;
  onChange: (f: UploadedFile | null) => void;
  error?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handle = async (ev: ChangeEvent<HTMLInputElement>) => {
    const picked = ev.target.files?.[0];
    if (!picked) return;
    setBusy(true); setFailed(false);
    try {
      onChange(await uploadApplicationFile(picked));
    } catch {
      setFailed(true);
      onChange(null);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <p className={"mb-1.5 text-sm font-medium text-ink/80" + (error ? " text-red-600" : "")}>
        {label} <span className="text-red-500">*</span>
      </p>
      <div
        className={
          "flex flex-wrap items-center gap-3 rounded-xl border p-3 " +
          (error ? "border-red-400 bg-red-50/40" : "border-black/[0.12] bg-white")
        }
      >
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className="rounded-lg bg-primary/10 px-3.5 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-50">
          {busy ? dict.uploading : dict.uploadCta}
        </button>
        {file && !busy && (
          <span className="inline-flex items-center gap-1.5 text-sm text-primary">
            ✓ {dict.uploaded}
            <span className="max-w-[160px] truncate text-ink/45">· {file.file_name}</span>
          </span>
        )}
        {failed && <span className="text-sm text-red-600">{dict.uploadFailed}</span>}
        <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handle} />
      </div>
      <span className="mt-1 block text-xs text-ink/45">{hint}</span>
    </div>
  );
}

// Sobe 1 arquivo (ID ou comprovante) via signed upload URL. Foto de iPhone vem
// em HEIC, que nem o navegador nem o PDF pro owner abrem: vira JPEG antes.
async function uploadApplicationFile(picked: File): Promise<UploadedFile> {
  let file0: File = picked;
  if (/^image\/hei[cf]$/i.test(picked.type) || /\.(heic|heif)$/i.test(picked.name)) {
    const { prepareImage } = await import("@/lib/image-prep");
    const prepared = await prepareImage(picked);
    file0 = new File([prepared.blob], prepared.fileName, { type: "image/jpeg" });
  }
  const { path, token } = await createIdUploadUrl(file0.name);
  const supabase = createClient();
  const { error: upErr } = await supabase.storage.from("documents").uploadToSignedUrl(path, token, file0);
  if (upErr) throw upErr;
  return { path, file_name: file0.name, content_type: file0.type };
}

// =============================================================================
// IncomeProofUpload — comprovante de renda (autônomo / aposentado), 1+ arquivos.
// =============================================================================
function IncomeProofUpload({
  dict, hint, files, onChange, error,
}: {
  dict: (typeof DICT)[Lang];
  hint: string;
  files: UploadedFile[];
  onChange: (f: UploadedFile[]) => void;
  error?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handle = async (ev: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(ev.target.files ?? []);
    if (picked.length === 0) return;
    setBusy(true); setFailed(false);
    const added: UploadedFile[] = [];
    for (const p of picked) {
      try { added.push(await uploadApplicationFile(p)); } catch { setFailed(true); }
    }
    onChange([...files, ...added]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <p className={"mb-1.5 text-sm font-medium text-ink/80" + (error ? " text-red-600" : "")}>
        {dict.incomeProof} <span className="text-red-500">*</span>
      </p>
      <div className={"space-y-2 rounded-xl border p-3 " + (error ? "border-red-400 bg-red-50/40" : "border-black/[0.12] bg-white")}>
        {files.map((uf, i) => (
          <div key={uf.path} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-primary">
              ✓ <span className="truncate text-ink/60">{uf.file_name}</span>
            </span>
            <button type="button" className="shrink-0 text-xs text-ink/45 hover:text-red-600" onClick={() => onChange(files.filter((_, j) => j !== i))}>
              {dict.remove}
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="rounded-lg bg-primary/10 px-3.5 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-50">
            {busy ? dict.uploading : files.length ? dict.addAnotherFile : dict.uploadCta}
          </button>
          {failed && <span className="text-sm text-red-600">{dict.uploadFailed}</span>}
        </div>
        <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handle} />
      </div>
      <span className="mt-1 block text-xs text-ink/45">{hint}</span>
    </div>
  );
}

// =============================================================================
// Sub-componentes de UI
// =============================================================================
const inputCls =
  "w-full rounded-xl border border-black/[0.1] bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-primary focus:ring-2 focus:ring-primary/20";
const addCls = "mt-3 text-sm font-semibold text-primary hover:underline";
const removeCls = "rounded-lg border border-black/[0.1] px-3 text-sm text-ink/60 hover:text-red-600";

function Section({ title, hint, accent, children }: { title: string; hint?: string; accent?: boolean; children: ReactNode }) {
  return (
    <section className={"glass p-5 sm:p-6" + (accent ? " border-l-4 !border-l-primary" : "")}>
      <h3 className="h-display text-base text-ink">{title}</h3>
      {hint && <p className="mt-1 text-xs text-ink/55">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink/80">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/45">{hint}</span>}
    </label>
  );
}

function YesNo({
  label, value, onChange, yes, no, err,
}: {
  label: string;
  value: "" | "yes" | "no";
  onChange: (v: "yes" | "no") => void;
  yes: string; no: string; err?: boolean;
}) {
  return (
    <div className={"flex flex-wrap items-center justify-between gap-3 rounded-lg p-1 " + (err ? "bg-red-50" : "")}>
      <span className="text-sm text-ink/80">{label}<span className="text-red-500"> *</span></span>
      <div className="flex gap-2">
        {(["yes", "no"] as const).map((opt) => (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className={"rounded-lg border px-4 py-1.5 text-sm font-medium transition " +
              (value === opt ? "border-primary bg-primary text-white" : "border-black/[0.1] text-ink/60 hover:border-primary/40")}>
            {opt === "yes" ? yes : no}
          </button>
        ))}
      </div>
    </div>
  );
}

// SSN ou ITIN: a equipe precisa saber qual dos dois foi informado.
function TaxIdType({
  dict: d, value, onChange, err,
}: {
  dict: (typeof DICT)[Lang];
  value: "" | "ssn" | "itin";
  onChange: (v: "ssn" | "itin") => void;
  err?: boolean;
}) {
  return (
    <div className={"flex flex-wrap items-center justify-between gap-3 rounded-lg p-1 " + (err ? "bg-red-50" : "")}>
      <span className="text-sm text-ink/80">{d.taxIdWhich}<span className="text-red-500"> *</span></span>
      <div className="flex gap-2">
        {(["ssn", "itin"] as const).map((opt) => (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className={"rounded-lg border px-4 py-1.5 text-sm font-medium transition " +
              (value === opt ? "border-primary bg-primary text-white" : "border-black/[0.1] text-ink/60 hover:border-primary/40")}>
            {opt === "ssn" ? d.taxIdSsn : d.taxIdItin}
          </button>
        ))}
      </div>
    </div>
  );
}

function upd<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((row, j) => (j === i ? { ...row, ...patch } : row));
}
