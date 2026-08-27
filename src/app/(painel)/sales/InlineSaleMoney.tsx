"use client";

// =============================================================================
// InlineSaleMoney — edita preço de venda + % + comissão ($) DIRETO na linha da
// tabela For sale, sem abrir a propriedade. A Andrea trabalha nesta tela, então
// o preço muda aqui (relista, baixa de preço) e não só na página da propriedade.
// A % recalcula o $ igual ao SaleFields; o $ continua sendo o que vale.
// =============================================================================
import { useState, useTransition } from "react";
import { money } from "@/lib/format";
import { Pencil, Loader2, Check, X } from "lucide-react";

export function InlineSaleMoney({
  id,
  price,
  rate,
  amount,
  canEdit,
  action,
}: {
  id: string;
  price: number | null;
  rate: number | null;
  amount: number | null;
  canEdit: boolean;
  action: (fd: FormData) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [p, setP] = useState(price != null ? String(price) : "");
  const [r, setR] = useState(rate != null ? String(rate) : "");
  const [a, setA] = useState(amount != null ? String(amount) : "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function recompute(nextPrice: string, nextRate: string) {
    const pv = parseFloat(nextPrice);
    const rv = parseFloat(nextRate);
    if (Number.isFinite(pv) && Number.isFinite(rv)) setA((Math.round(pv * rv) / 100).toFixed(2));
  }

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("sale_price", p.trim());
    fd.set("sale_commission_rate", r.trim());
    fd.set("sale_commission", a.trim());
    start(async () => {
      try {
        await action(fd);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  const cell =
    "w-24 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm text-ink outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15";

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-ink/65">{price != null ? money(price) : "—"}</span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit price and commission"
            className="grid h-6 w-6 place-items-center rounded-md border border-black/[0.08] text-ink/35 transition hover:border-primary/40 hover:text-primary"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <label className="sr-only" htmlFor={`price-${id}`}>
        Sale price
      </label>
      <input
        id={`price-${id}`}
        type="number"
        step="0.01"
        min={0}
        value={p}
        onChange={(e) => {
          setP(e.target.value);
          recompute(e.target.value, r);
        }}
        placeholder="Price"
        className={cell}
        autoFocus
      />
      <input
        type="number"
        step="0.01"
        min={0}
        value={r}
        onChange={(e) => {
          setR(e.target.value);
          recompute(p, e.target.value);
        }}
        placeholder="%"
        aria-label="Commission percent"
        className={cell + " !w-16"}
      />
      <input
        type="number"
        step="0.01"
        min={0}
        value={a}
        onChange={(e) => setA(e.target.value)}
        placeholder="Commission $"
        aria-label="Commission amount"
        className={cell}
      />
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="grid h-7 w-7 place-items-center rounded-md border border-primary/30 bg-primary/[0.08] text-primary transition hover:bg-primary/[0.15] disabled:opacity-60"
        aria-label="Save"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => {
          setP(price != null ? String(price) : "");
          setR(rate != null ? String(rate) : "");
          setA(amount != null ? String(amount) : "");
          setEditing(false);
          setError(null);
        }}
        disabled={pending}
        className="grid h-7 w-7 place-items-center rounded-md border border-black/[0.10] bg-white text-ink/50 transition hover:text-ink disabled:opacity-60"
        aria-label="Cancel"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {error && <span className="w-full text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
