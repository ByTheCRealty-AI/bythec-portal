"use client";

import { useRef, useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { Plus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_STATUS_LABEL, type PaymentKind } from "@/lib/types";

// Ordem fixa do select de kind (Monthly / First month / Last month / Security
// deposit). Definida aqui — não derivada do label map — pra travar a ordem.
const KIND_OPTIONS: Array<{ value: PaymentKind; label: string }> = [
  { value: "monthly", label: "Monthly rent" },
  { value: "first_month", label: "First month" },
  { value: "last_month", label: "Last month" },
  { value: "security_deposit", label: "Security deposit" },
];

// Limite e sanitização do nome — mesmo padrão do DocumentAddForm. O recibo é
// OPCIONAL: se não houver arquivo, o fluxo segue idêntico ao de hoje.
const MAX_RECEIPT_BYTES = 25 * 1024 * 1024; // 25 MB

function safeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "");
  return cleaned || "file";
}

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
  depositAction,
  fixedProperty,
}: {
  properties?: PaymentPropertyOption[];
  action: (fd: FormData) => void | Promise<void>;
  // Server action for the security-deposit split path. Required for that flow;
  // if omitted, the Security deposit option is hidden from the kind select.
  depositAction?: (fd: FormData) => void | Promise<void>;
  fixedProperty?: FixedProperty;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(
    fixedProperty?.rent_price != null ? String(fixedProperty.rent_price) : ""
  );
  // Selected kind drives which field set we show. Security deposit swaps the
  // single amount/date for total + installments + first due date.
  const [kind, setKind] = useState<PaymentKind>("monthly");
  const isDeposit = kind === "security_deposit";

  // The deposit option only renders if a depositAction was provided.
  const kindOptions = depositAction
    ? KIND_OPTIONS
    : KIND_OPTIONS.filter((o) => o.value !== "security_deposit");

  function onPickProperty(id: string) {
    const p = properties.find((x) => x.id === id);
    // Só pré-preenche; o usuário pode sobrescrever depois.
    setAmount(p?.rent_price != null ? String(p.rent_price) : "");
  }

  function resetAmount() {
    setAmount(fixedProperty?.rent_price != null ? String(fixedProperty.rent_price) : "");
  }

  function reset() {
    setError(null);
    setBusy(false);
    setOpen(false);
    setKind("monthly");
    resetAmount();
  }

  // Submit custom: se houver recibo, sobe pro bucket privado `documents`
  // (client-side, pra o Storage RLS usar a sessão do usuário) ANTES de chamar a
  // action. O object PATH resultante vai em hidden inputs; a action grava a linha
  // em payment_attachments. Sem arquivo = fluxo idêntico ao de hoje.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;

    // Security-deposit split path: no receipt, route to the deposit action.
    // The form carries deposit_total / installment_total / first_due_date.
    if (isDeposit) {
      if (!depositAction) {
        setError("Security deposits are not available here.");
        return;
      }
      setBusy(true);
      try {
        const fd = new FormData(form);
        fd.delete("receipt");
        await depositAction(fd);
        reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
        setBusy(false);
      }
      return;
    }

    const file = fileRef.current?.files?.[0] ?? null;

    setBusy(true);
    try {
      if (file) {
        if (file.size > MAX_RECEIPT_BYTES) {
          setError("Receipt is too large. Maximum size is 25 MB.");
          setBusy(false);
          return;
        }
        const supabase = createClient();
        const path = `payment-receipts/${crypto.randomUUID()}-${safeName(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(path, file, {
            upsert: false,
            contentType: file.type || "application/octet-stream",
          });
        if (upErr) {
          setError(`Receipt upload failed: ${upErr.message}`);
          setBusy(false);
          return;
        }
        // Carrega os campos do recibo no FormData enviado à action.
        (form.elements.namedItem("receipt_file_url") as HTMLInputElement).value = path;
        (form.elements.namedItem("receipt_file_name") as HTMLInputElement).value = file.name;
        (form.elements.namedItem("receipt_content_type") as HTMLInputElement).value =
          file.type || "";
      }

      const fd = new FormData(form);
      // O binário já foi pro Storage client-side; não reenviar na server action.
      fd.delete("receipt");
      await action(fd);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={buttonClass("primary")}>
        <Plus className="h-4 w-4" /> Add payment
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass mb-6 space-y-5 p-6">
      {/* Recibo (opcional): preenchidos client-side após o upload. */}
      <input type="hidden" name="receipt_file_url" defaultValue="" />
      <input type="hidden" name="receipt_file_name" defaultValue="" />
      <input type="hidden" name="receipt_content_type" defaultValue="" />

      <div className="flex items-center justify-between">
        <h3 className="h-display text-base text-ink">New payment</h3>
        <span className="text-xs text-ink/45">
          {isDeposit ? "Security deposit · split into installments" : "Rent payment · cash basis"}
        </span>
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
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as PaymentKind)}
            className={inputClass}
          >
            {kindOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        {isDeposit ? (
          <>
            <Field
              label="Number of installments"
              hint="The deposit is split into this many monthly installments."
            >
              <input
                name="installment_total"
                type="number"
                step="1"
                min={1}
                max={24}
                defaultValue={3}
                className={inputClass}
              />
            </Field>
            <Field
              label="Total deposit amount (USD)"
              hint="Whole dollars. Split evenly, with the remainder on the earliest installments."
            >
              <input
                name="deposit_total"
                type="number"
                step="1"
                min={1}
                className={inputClass}
                placeholder="2300"
                required
              />
            </Field>
            <Field
              label="First due date"
              hint="Following installments fall on the same day each month."
            >
              <input name="first_due_date" type="date" required className={inputClass} />
            </Field>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      <Field label="Notes">
        <textarea
          name="notes"
          rows={2}
          className={inputClass}
          placeholder="Optional — e.g. paid by Zelle, partial payment…"
        />
      </Field>

      {!isDeposit && (
        <Field label="Receipt (optional)" hint="Up to 25 MB. Image or PDF.">
          <input
            ref={fileRef}
            name="receipt"
            type="file"
            accept="image/*,application/pdf"
            className={inputClass}
          />
        </Field>
      )}

      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={busy} className={buttonClass("primary")}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Adding…
            </>
          ) : isDeposit ? (
            "Add deposit"
          ) : (
            "Add payment"
          )}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className={buttonClass("ghost")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
