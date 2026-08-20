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
  HistoryInput,
  PropertyOption,
  ReferenceInput,
  VehicleInput,
} from "./types";
import { createApplicationPaymentIntent, createIdUploadUrl, submitApplication } from "./actions";
import { createClient } from "@/lib/supabase/client";

const PUBLISHABLE = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = PUBLISHABLE ? loadStripe(PUBLISHABLE) : null;
const OTHER = "__other__";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function digits(s: string): string {
  return (s || "").replace(/\D/g, "");
}
// Formata telefone US enquanto digita: (508) 555-1234.
function formatPhone(v: string): string {
  const d = digits(v).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

interface UploadedFile { path: string; file_name: string; content_type: string }
interface OccRow { name: string; dob: string; is_adult: boolean; phone: string; idFile: UploadedFile | null }

interface FlatState {
  rental_type: "" | "year_round" | "winter";
  lease_start: string;
  property_id: string;
  property_other: string;
  full_name: string;
  date_of_birth: string;
  has_ssn: "" | "yes" | "no";
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
  has_ssn: "", ssn: "", ssn_none_explanation: "", phone: "",
  has_license: "", drivers_license: "", drivers_license_state: "", gov_id_type: "", gov_id_number: "",
  email: "", occupants_count: "",
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

export default function ApplyForm({ properties }: { properties: PropertyOption[] }) {
  const [lang, setLang] = useState<Lang>("en");
  const d = DICT[lang];

  const [f, setF] = useState<FlatState>(EMPTY_FLAT);
  const set = <K extends keyof FlatState>(k: K, v: FlatState[K]) => setF((p) => ({ ...p, [k]: v }));

  const [occupants, setOccupants] = useState<OccRow[]>([
    { name: "", dob: "", is_adult: false, phone: "", idFile: null },
  ]);
  const [history, setHistory] = useState<HistoryInput[]>([
    emptyHist("current"), emptyHist("previous"),
  ]);
  const [vehicles, setVehicles] = useState<VehicleInput[]>([emptyVeh()]);
  const [refs, setRefs] = useState<ReferenceInput[]>([
    { name: "", phone: "" }, { name: "", phone: "" },
  ]);
  const [applicantId, setApplicantId] = useState<UploadedFile | null>(null);

  // ---- PaymentIntent ($50) --------------------------------------------------
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    createApplicationPaymentIntent()
      .then((r) => { if (alive) { setClientSecret(r.clientSecret); setPaymentIntentId(r.paymentIntentId); } })
      .catch((e) => alive && setInitError(e instanceof Error ? e.message : "Payment init failed."));
    return () => { alive = false; };
  }, []);

  const yesNo = (v: "" | "yes" | "no"): boolean | null => (v === "" ? null : v === "yes");
  const numOrNull = (s: string): number | null => {
    const n = Number((s || "").replace(/[^0-9.]/g, ""));
    return s.trim() && Number.isFinite(n) ? n : null;
  };

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
    need("date_of_birth", f.date_of_birth);

    if (f.has_ssn === "") e.add("has_ssn");
    else if (f.has_ssn === "yes") need("ssn", f.ssn);
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
    if (!applicantId) e.add("applicant_id_upload");

    need("occupants_count", f.occupants_count);
    // Ocupante #1 é o próprio candidato. Só exige detalhes de OUTROS ocupantes
    // quando o total for 2+. Se for 1, não precisa listar ninguém.
    if (occCount != null && occCount >= 2) {
      occupants.forEach((o, i) => {
        need(`occ_${i}_name`, o.name);
        need(`occ_${i}_dob`, o.dob);
        if (o.is_adult) {
          need(`occ_${i}_phone`, o.phone);
          if (o.phone.trim() && f.phone.trim() && digits(o.phone) === digits(f.phone)) e.add(`occ_${i}_phone_dup`);
          if (!o.idFile) e.add(`occ_${i}_id`);
        }
      });
    }

    history.forEach((h, i) => {
      need(`hist_${i}_street`, h.street);
      need(`hist_${i}_city`, h.city);
      need(`hist_${i}_state`, h.state);
      need(`hist_${i}_zip`, h.zip);
      need(`hist_${i}_dur`, h.duration);
      need(`hist_${i}_lname`, h.landlord_name);
      need(`hist_${i}_lphone`, h.landlord_phone);
    });

    vehicles.forEach((v, i) => {
      need(`veh_${i}_mm`, v.make_model);
      need(`veh_${i}_year`, v.year);
      need(`veh_${i}_color`, v.color);
      need(`veh_${i}_plate`, v.plate);
      need(`veh_${i}_state`, v.plate_state);
    });

    need("employer", f.employer);
    need("employer_address", f.employer_address);
    need("manager_name", f.manager_name);
    need("manager_phone", f.manager_phone);
    need("job_title", f.job_title);
    need("monthly_income", f.monthly_income);
    need("length_of_employment", f.length_of_employment);

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
          ? occupants.map((o) => ({ name: o.name, dob: o.dob, is_adult: o.is_adult, phone: o.phone }))
          : [],
      rental_history: history,
      vehicles,

      employer: f.employer.trim() || null,
      employer_address: f.employer_address.trim() || null,
      manager_name: f.manager_name.trim() || null,
      manager_phone: f.manager_phone.trim() || null,
      job_title: f.job_title.trim() || null,
      monthly_income: numOrNull(f.monthly_income),
      length_of_employment: f.length_of_employment.trim() || null,

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
    };
  };

  const [errs, setErrs] = useState<Set<string>>(new Set());
  const E = (key: string) => (errs.has(key) ? " !border-red-400 ring-2 ring-red-200" : "");

  const appearance = useMemo(
    () => ({ theme: "stripe" as const, variables: { colorPrimary: "#198577", colorText: "#0f1b19", borderRadius: "12px" } }),
    []
  );

  // Ocupante #1 = o próprio candidato. Só pede detalhes de outros ocupantes se 2+.
  const occCountLive = numOrNull(f.occupants_count);
  const showOtherOccupants = occCountLive != null && occCountLive >= 2;

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
            <input className={inputCls + E("date_of_birth")} placeholder="MM/DD/YY" value={f.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
          </Field>
        </div>

        {/* SSN branch */}
        <div className="mt-4">
          <YesNo label={d.ssnQuestion} value={f.has_ssn} onChange={(v) => set("has_ssn", v)} yes={d.yesShort} no={d.noShort} err={errs.has("has_ssn")} />
          {f.has_ssn === "yes" && (
            <div className="mt-3"><Field label={d.ssn} hint={d.ssnHint} required>
              <input type="password" className={inputCls + E("ssn")} inputMode="numeric" autoComplete="off" value={f.ssn} onChange={(e) => set("ssn", e.target.value)} />
            </Field></div>
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
                  <input className={inputCls + E(`occ_${i}_dob`)} placeholder="MM/DD/YY" value={o.dob} onChange={(e) => setOccupants(upd(occupants, i, { dob: e.target.value }))} />
                </Field>
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm text-ink/80">
                <input type="checkbox" className="h-4 w-4 accent-[#198577]" checked={o.is_adult} onChange={(e) => setOccupants(upd(occupants, i, { is_adult: e.target.checked }))} />
                {d.occAdult}
              </label>
              {o.is_adult && (
                <div className="mt-3 space-y-3">
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
        <button type="button" className={addCls} onClick={() => setOccupants([...occupants, { name: "", dob: "", is_adult: false, phone: "", idFile: null }])}>
          {d.addOccupant}
        </button>
        </>
        )}
      </Section>

      {/* Histórico de aluguel — todos obrigatórios */}
      <Section title={d.historySection} hint={d.historyHint}>
        <div className="space-y-4">
          {history.map((h, i) => (
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
                <Field label={d.howLong} required><input className={inputCls + E(`hist_${i}_dur`)} value={h.duration} onChange={(e) => setHistory(upd(history, i, { duration: e.target.value }))} /></Field>
                <Field label={d.landlordName} required><input className={inputCls + E(`hist_${i}_lname`)} value={h.landlord_name} onChange={(e) => setHistory(upd(history, i, { landlord_name: e.target.value }))} /></Field>
                <Field label={d.landlordPhone} required><input className={inputCls + E(`hist_${i}_lphone`)} inputMode="tel" value={h.landlord_phone} onChange={(e) => setHistory(upd(history, i, { landlord_phone: formatPhone(e.target.value) }))} /></Field>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Veículos — obrigatório */}
      <Section title={d.vehiclesSection}>
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

      {/* Emprego — todos obrigatórios */}
      <Section title={d.employmentSection}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={d.employer} required><input className={inputCls + E("employer")} value={f.employer} onChange={(e) => set("employer", e.target.value)} /></Field>
          <Field label={d.employerAddress} required><input className={inputCls + E("employer_address")} value={f.employer_address} onChange={(e) => set("employer_address", e.target.value)} /></Field>
          <Field label={d.managerName} required><input className={inputCls + E("manager_name")} value={f.manager_name} onChange={(e) => set("manager_name", e.target.value)} /></Field>
          <Field label={d.managerPhone} required><input className={inputCls + E("manager_phone")} inputMode="tel" value={f.manager_phone} onChange={(e) => set("manager_phone", formatPhone(e.target.value))} /></Field>
          <Field label={d.jobTitle} required><input className={inputCls + E("job_title")} value={f.job_title} onChange={(e) => set("job_title", e.target.value)} /></Field>
          <Field label={d.monthlyIncome} required><input className={inputCls + E("monthly_income")} inputMode="decimal" placeholder="$" value={f.monthly_income} onChange={(e) => set("monthly_income", e.target.value)} /></Field>
          <Field label={d.lengthEmployment} required><input className={inputCls + E("length_of_employment")} value={f.length_of_employment} onChange={(e) => set("length_of_employment", e.target.value)} /></Field>
        </div>
      </Section>

      {/* Referências — ambas obrigatórias */}
      <Section title={d.referencesSection}>
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
      <Section title={d.additionalSection}>
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
      <Section title={d.consentSection}>
        <p className="whitespace-pre-line text-xs leading-relaxed text-ink/70">{d.consentText}</p>
        <label className={"mt-4 flex cursor-pointer items-start gap-3 rounded-xl p-2 text-sm text-ink" + (errs.has("consent") ? " bg-red-50" : "")}>
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[#198577]" checked={f.consent_agreed} onChange={(e) => set("consent_agreed", e.target.checked)} />
          <span>{d.consentCheckbox}</span>
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={d.signature} required><input className={inputCls + E("signature_name")} value={f.signature_name} onChange={(e) => set("signature_name", e.target.value)} /></Field>
          <Field label={d.date} required><input type="date" className={inputCls + E("signature_date")} value={f.signature_date} onChange={(e) => set("signature_date", e.target.value)} /></Field>
          <Field label={d.signature2}><input className={inputCls} value={f.signature_name_2} onChange={(e) => set("signature_name_2", e.target.value)} /></Field>
          <Field label={d.date}><input type="date" className={inputCls} value={f.signature_date_2} onChange={(e) => set("signature_date_2", e.target.value)} /></Field>
        </div>
      </Section>

      {/* Pagamento + envio */}
      <Section title={d.feeSection}>
        <p className="text-sm text-ink/70">{d.feeText}</p>
        {initError && <p className="mt-3 text-sm text-red-600">{initError}</p>}
        {!stripePromise && <p className="mt-3 text-sm text-red-600">Payment is not configured yet. Please call (508) 364-8556.</p>}
        {stripePromise && clientSecret ? (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
            <PaymentSubmit dict={d} paymentIntentId={paymentIntentId} getPayload={buildPayload} validate={validate} onErrors={setErrs} />
          </Elements>
        ) : (
          !initError && stripePromise && <p className="mt-3 text-sm text-ink/50">Loading secure payment…</p>
        )}
      </Section>
    </div>
  );
}

// =============================================================================
// PaymentSubmit — dentro de <Elements> pra ter stripe/elements.
// =============================================================================
function PaymentSubmit({
  dict, paymentIntentId, getPayload, validate, onErrors,
}: {
  dict: (typeof DICT)[Lang];
  paymentIntentId: string | null;
  getPayload: () => Omit<ApplicationInput, "stripe_payment_intent_id">;
  validate: () => Set<string>;
  onErrors: (e: Set<string>) => void;
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
    if (!stripe || !elements || !paymentIntentId) return showError(dict.payFirst);

    setSubmitting(true);
    try {
      const { error: payErr, paymentIntent } = await stripe.confirmPayment({
        elements, redirect: "if_required",
        confirmParams: { return_url: window.location.origin + "/apply/thank-you" },
      });
      if (payErr) { setSubmitting(false); return showError(payErr.message || dict.errorGeneric); }
      if (!paymentIntent || paymentIntent.status !== "succeeded") { setSubmitting(false); return showError(dict.errorGeneric); }

      const res = await submitApplication({ ...getPayload(), stripe_payment_intent_id: paymentIntent.id });
      if (!res.ok) { setSubmitting(false); return showError(res.error || dict.errorGeneric); }
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
        {submitting ? dict.submitting : dict.submit}
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
    const file0 = ev.target.files?.[0];
    if (!file0) return;
    setBusy(true); setFailed(false);
    try {
      const { path, token } = await createIdUploadUrl(file0.name);
      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from("documents").uploadToSignedUrl(path, token, file0);
      if (upErr) throw upErr;
      onChange({ path, file_name: file0.name, content_type: file0.type });
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

// =============================================================================
// Sub-componentes de UI
// =============================================================================
const inputCls =
  "w-full rounded-xl border border-black/[0.1] bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-primary focus:ring-2 focus:ring-primary/20";
const addCls = "mt-3 text-sm font-semibold text-primary hover:underline";
const removeCls = "rounded-lg border border-black/[0.1] px-3 text-sm text-ink/60 hover:text-red-600";

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="glass p-5 sm:p-6">
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

function upd<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((row, j) => (j === i ? { ...row, ...patch } : row));
}
