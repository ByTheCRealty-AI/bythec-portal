"use client";

import { useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { Plus } from "lucide-react";
import { PAYMENT_KIND_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/types";

// Propriedade elegível pra receber pagamentos (year-round / off-season). O rent
// pré-preenche o valor ao escolher; o tenant é derivado no servidor (não vem do
// cliente). address2 só pra exibir a unidade no select.
export type PaymentPropertyOption = {
  id: string;
  address: string;
  address2: string | null;
  rent_price: number | null;
};

const COMMISSION_HINT =
  "By the C year-round commission is 10% of monthly rent, counted when received.";

// Propriedade fixa: usada no modo embutido (aba Payments da propriedade). Quando
// passada, o picker some, o property_id vai num hidden, e o valor pré-preenche
// com o rent dela. O tenant continua sendo resolvido server-side na action.
export type FixedProperty = {
  id: string;
  rent_price: number | null;
};

// Form inline pra registrar um pagamento de aluguel. Mesmo padrão toggle/glass
// das outras adds. Ao escolher a propriedade, pré-preenche o valor com o rent
// dela (ainda editável). O tenant é resolvido server-side na action.
//
// Dois modos:
//  - picker (default): mostra o select de propriedades elegíveis (tela /payments).
//  - fixedProperty: propriedade travada (aba da propriedade), sem picker.
export function PaymentAddForm({
  properties = [],
  action,
  fixedProperty,
}: {
  properties?: PaymentPropertyOption[];
  action: (fd: FormData) => void | Promise<void>;
  fixedProperty?: FixedProperty;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(
    fixedProperty?.rent_price != null ? String(fixedProperty.rent_price) : ""
  );

  function onPickProperty(id: string) {
    const p = properties.find((x) => x.id === id);
    // Só pré-preenche; o usuário pode sobrescrever depois.
    setAmount(p?.rent_price != null ? String(p.rent_price) : "");
  }

  function resetAmount() {
    setAmount(fixedProperty?.rent_price != null ? String(fixedProperty.rent_price) : "");
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={buttonClass("primary")}>
        <Plus className="h-4 w-4" /> Add payment
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await action(fd);
        setOpen(false);
        resetAmount();
      }}
      className="glass mb-6 space-y-5 p-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="h-display text-base text-ink">New payment</h3>
        <span className="text-xs text-ink/45">Rent payment · cash basis</span>
      </div>

      {fixedProperty ? (
        // Modo propriedade-fixa: sem picker; o property_id vai num hidden.
        <input type="hidden" name="property_id" value={fixedProperty.id} />
      ) : (
        <Field label="Property *" hint="Year-round and off-season rentals only.">
          <select
            name="property_id"
            required
            defaultValue=""
            onChange={(e) => onPickProperty(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Select a property…
            </option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.address}
                {p.address2 ? ` · ${p.address2}` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Kind">
          <select name="kind" defaultValue="monthly" className={inputClass}>
            {Object.entries(PAYMENT_KIND_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue="due" className={inputClass}>
            {Object.entries(PAYMENT_STATUS_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Month">
          <input name="month" type="date" className={inputClass} />
        </Field>
        <Field label="Due date">
          <input name="due_date" type="date" className={inputClass} />
        </Field>
        <Field label="Amount (USD)">
          <input
            name="rent_amount"
            type="number"
            step="0.01"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
            placeholder="2500.00"
          />
        </Field>
        <Field label="Commission (USD)" hint={COMMISSION_HINT}>
          <input
            name="commission"
            type="number"
            step="0.01"
            min={0}
            className={inputClass}
            placeholder="Optional"
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          name="notes"
          rows={2}
          className={inputClass}
          placeholder="Optional — e.g. paid by Zelle, partial payment…"
        />
      </Field>

      <div className="flex gap-3">
        <button type="submit" className={buttonClass("primary")}>
          Add payment
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            resetAmount();
          }}
          className={buttonClass("ghost")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
