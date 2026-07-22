"use client";

// Seção "Sale" das propriedades For Sale: preço de venda + comissão da By the C.
// A comissão % (opcional) AUTO-PREENCHE o valor em $ a partir do preço; a Andrea
// pode sobrescrever o $ direto. Ambos são salvos (o $ é o que vale). Usada pelo
// form de criar E de editar propriedade.
import { useState } from "react";
import { Field, inputClass } from "@/components/ui";

export function SaleFields({
  defaults,
}: {
  defaults?: { price?: number | null; rate?: number | null; amount?: number | null };
}) {
  const [price, setPrice] = useState(defaults?.price != null ? String(defaults.price) : "");
  const [rate, setRate] = useState(defaults?.rate != null ? String(defaults.rate) : "");
  const [amount, setAmount] = useState(defaults?.amount != null ? String(defaults.amount) : "");

  // $ = preço × %/100, arredondado a centavos. Só recomputa se ambos forem números.
  function recompute(nextPrice: string, nextRate: string) {
    const p = parseFloat(nextPrice);
    const r = parseFloat(nextRate);
    if (Number.isFinite(p) && Number.isFinite(r)) {
      setAmount((Math.round(p * r) / 100).toFixed(2));
    }
  }

  return (
    <section className="glass p-6">
      <h2 className="h-display mb-1 text-base text-ink">Sale</h2>
      <p className="mb-5 text-xs text-ink/45">Shown for For Sale properties.</p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field label="Sale price (USD)" hint="What the house is being sold for.">
          <input
            name="sale_price"
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              recompute(e.target.value, rate);
            }}
            className={inputClass}
            placeholder="650000"
          />
        </Field>
        <Field label="My commission %" hint="Optional — fills in the amount from the price.">
          <input
            name="sale_commission_rate"
            type="number"
            step="0.01"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              recompute(price, e.target.value);
            }}
            className={inputClass}
            placeholder="2.5"
          />
        </Field>
        <Field label="My commission (USD)" hint="Auto-filled from the %. You can override it.">
          <input
            name="sale_commission"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
            placeholder="16250"
          />
        </Field>
      </div>
    </section>
  );
}
