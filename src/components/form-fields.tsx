"use client";

// =============================================================================
// By the C — Shared form field components (DRY)
// =============================================================================
// PhoneInput + AddressFields são reutilizados pelo formulário de Users e de
// Clients. Mantidos client-side ("use client") porque controlam estado local
// (formatação enquanto digita). Os NOMES dos campos são configuráveis para que
// cada formulário submeta nas colunas corretas do banco.
// =============================================================================

import { useState } from "react";
import { Field, inputClass } from "@/components/ui";

// ---- Phone formatting helpers ---------------------------------------------
// Normaliza pra no máximo 10 dígitos (pega os ÚLTIMOS 10 — corrige colagem com
// +1 ou código de país) e renderiza progressivamente como (XXX) XXX-XXXX.
export function formatUsPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(-10);
  const len = digits.length;
  if (len === 0) return "";
  if (len < 4) return `(${digits}`;
  if (len < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Input de telefone controlado: formata enquanto digita e submete em `name`.
// `name` é configurável (Users usa "phone"; Clients usa "phone" e "co_client_phone").
export function PhoneInput({
  name = "phone",
  defaultValue,
  placeholder = "(508) 555-0142",
}: {
  name?: string;
  defaultValue?: string | null;
  placeholder?: string;
}) {
  const [value, setValue] = useState<string>(() => formatUsPhone(defaultValue ?? ""));
  return (
    <input
      name={name}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value}
      onChange={(e) => setValue(formatUsPhone(e.target.value))}
      className={inputClass}
      placeholder={placeholder}
    />
  );
}

// ---- Address fields (structured) ------------------------------------------
// Street (full), Apt/Unit (full, optional), then City/State/ZIP em grid.
// Não usa <Field> no grid porque Field embrulha tudo num único <label>.
// Os NOMES das colunas são configuráveis via `names`:
//   Users   -> address_line1 / address_line2 / city / state / zip
//   Clients -> billing_address / billing_address2 / billing_city / billing_state / billing_zip

export interface AddressFieldNames {
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
}

export interface AddressFieldDefaults {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

const DEFAULT_NAMES: AddressFieldNames = {
  line1: "address_line1",
  line2: "address_line2",
  city: "city",
  state: "state",
  zip: "zip",
};

export function AddressFields({
  names = DEFAULT_NAMES,
  defaults,
}: {
  names?: AddressFieldNames;
  defaults?: AddressFieldDefaults;
}) {
  const labelClass =
    "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50";
  return (
    <div className="space-y-4">
      <Field label="Street address">
        <input
          name={names.line1}
          defaultValue={defaults?.line1 ?? ""}
          className={inputClass}
          placeholder="123 Main St"
        />
      </Field>
      <Field label="Apt / Unit / Suite">
        <input
          name={names.line2}
          defaultValue={defaults?.line2 ?? ""}
          className={inputClass}
          placeholder="Apt 4B (optional)"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-start">
        <label className="block">
          <span className={labelClass}>City</span>
          <input
            name={names.city}
            defaultValue={defaults?.city ?? ""}
            className={inputClass}
            placeholder="Hyannis"
          />
        </label>
        <label className="block">
          <span className={labelClass}>State</span>
          <input
            name={names.state}
            defaultValue={defaults?.state ?? ""}
            className={inputClass + " sm:w-20"}
            placeholder="MA"
            maxLength={20}
          />
        </label>
        <label className="block">
          <span className={labelClass}>ZIP</span>
          <input
            name={names.zip}
            defaultValue={defaults?.zip ?? ""}
            className={inputClass + " sm:w-28"}
            placeholder="02601"
            inputMode="numeric"
            maxLength={10}
          />
        </label>
      </div>
    </div>
  );
}
