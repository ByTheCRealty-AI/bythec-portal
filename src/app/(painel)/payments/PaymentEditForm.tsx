"use client";

// Formulário de edição dos campos-núcleo de um pagamento (kind, status, month,
// due date, amount, commission, notes + propriedade). Extraído do antigo EditRow
// pra ser reusado DENTRO da janela do pagamento (PaymentWindow). Sem wrapper de
// tabela — renderiza só o <form>.
import { Field, inputClass, buttonClass } from "@/components/ui";
import { PAYMENT_KIND_LABEL, PAYMENT_STATUS_LABEL, type Payment } from "@/lib/types";
import type { PaymentPropertyOption } from "./PaymentAddForm";

export function PaymentEditForm({
  payment,
  properties,
  updateAction,
  onDone,
  hideProperty = false,
}: {
  payment: Payment;
  properties: PaymentPropertyOption[];
  updateAction: (fd: FormData) => void | Promise<void>;
  onDone: () => void;
  hideProperty?: boolean;
}) {
  return (
    <form
      action={async (fd) => {
        await updateAction(fd);
        onDone();
      }}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={payment.id} />

      {hideProperty ? (
        <input type="hidden" name="property_id" value={payment.property_id} />
      ) : (
        <Field label="Property *">
          <select name="property_id" required defaultValue={payment.property_id} className={inputClass}>
            {payment.property && !properties.some((p) => p.id === payment.property_id) && (
              <option value={payment.property_id}>
                {payment.property.address}
                {payment.property.address2 ? ` · ${payment.property.address2}` : ""}
              </option>
            )}
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
          <select name="kind" defaultValue={payment.kind} className={inputClass}>
            {Object.entries(PAYMENT_KIND_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={payment.status} className={inputClass}>
            {Object.entries(PAYMENT_STATUS_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Month">
          <input name="month" type="date" defaultValue={payment.month ?? ""} className={inputClass} />
        </Field>
        <Field label="Due date">
          <input name="due_date" type="date" defaultValue={payment.due_date ?? ""} className={inputClass} />
        </Field>
        <Field label="Amount (USD)">
          <input
            name="rent_amount"
            type="number"
            step="0.01"
            min={0}
            defaultValue={payment.rent_amount ?? ""}
            className={inputClass}
            placeholder="2500.00"
          />
        </Field>
        <Field
          label="Commission (USD)"
          hint="By the C year-round commission is 10% of monthly rent, counted when received."
        >
          <input
            name="commission"
            type="number"
            step="0.01"
            min={0}
            defaultValue={payment.commission ?? ""}
            className={inputClass}
            placeholder="Optional"
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          name="notes"
          rows={2}
          defaultValue={payment.notes ?? ""}
          className={inputClass}
          placeholder="Optional — e.g. paid by Zelle, partial payment…"
        />
      </Field>

      <div className="flex gap-3">
        <button type="submit" className={buttonClass("primary")}>
          Save payment
        </button>
        <button type="button" onClick={onDone} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
