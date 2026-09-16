"use client";

// Street / City-town / State / ZIP separados + hidden com o endereço composto
// (nome padrão "address"). Pré-preenche quebrando o endereço salvo. Pra resetar
// depois de um autofill (ex.: picker de propriedade), troque a `key`.
import { useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { composeAddress, parseAddress, type AddressParts } from "@/lib/address";

export function AddressFields({
  name = "address",
  defaultValue,
  required = false,
  streetLabel = "Street address",
  streetHint,
  onChange,
}: {
  name?: string;
  defaultValue?: string | null;
  required?: boolean;
  streetLabel?: string;
  streetHint?: string;
  onChange?: (composed: string) => void;
}) {
  const [a, setA] = useState<AddressParts>(() => {
    const p = parseAddress(defaultValue);
    return p.state ? p : { ...p, state: p.street ? "" : "MA" };
  });
  const set = (patch: Partial<AddressParts>) =>
    setA((prev) => {
      const next = { ...prev, ...patch };
      onChange?.(composeAddress(next));
      return next;
    });

  return (
    <>
      <Field label={streetLabel + (required ? " *" : "")} hint={streetHint}>
        <input
          value={a.street}
          required={required}
          onChange={(e) => set({ street: e.target.value })}
          className={inputClass}
          placeholder="123 Main St"
        />
      </Field>
      <Field label="City / town">
        <input value={a.city} onChange={(e) => set({ city: e.target.value })} className={inputClass} placeholder="Hyannis" />
      </Field>
      <div className="grid grid-cols-2 gap-5">
        <Field label="State">
          <input
            value={a.state}
            onChange={(e) => set({ state: e.target.value.toUpperCase() })}
            maxLength={2}
            className={inputClass}
            placeholder="MA"
          />
        </Field>
        <Field label="ZIP">
          <input
            value={a.zip}
            onChange={(e) => set({ zip: e.target.value })}
            inputMode="numeric"
            className={inputClass}
            placeholder="02601"
          />
        </Field>
      </div>
      <input type="hidden" name={name} value={composeAddress(a)} />
    </>
  );
}
