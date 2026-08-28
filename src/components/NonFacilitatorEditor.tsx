"use client";

// =============================================================================
// NonFacilitatorEditor — serviço NÃO-facilitador: taxa ÚNICA em vez da comissão
// padrão. Fonte única na property; este MESMO componente é usado na página da
// propriedade E na do cliente (edita a mesma property → "either place, in sync").
// fee_type: percent (% do preço/venda) | flat ($ fixo) | one_month_rent.
// =============================================================================

import { useState, useTransition } from "react";
import { setNonFacilitatorAction } from "@/app/(painel)/propriedades/actions";

type FeeType = "percent" | "flat" | "one_month_rent";

export function nonFacilitatorSummary(
  on: boolean,
  type: FeeType | null,
  value: number | null
): string {
  if (!on) return "Facilitator (standard commission)";
  if (type === "one_month_rent") return "Non-facilitator · one month's rent (one-time)";
  if (type === "percent") return `Non-facilitator · ${value ?? 0}% one-time`;
  if (type === "flat") return `Non-facilitator · $${(value ?? 0).toLocaleString("en-US")} one-time`;
  return "Non-facilitator (one-time fee)";
}

export function NonFacilitatorEditor({
  propertyId,
  canEdit,
  initialOn,
  initialType,
  initialValue,
  landlord = false,
}: {
  propertyId: string;
  canEdit: boolean;
  initialOn: boolean;
  initialType: FeeType | null;
  initialValue: number | null;
  // landlord = aluguel (mostra a opção "one month's rent"); buy/sell não.
  landlord?: boolean;
}) {
  const [on, setOn] = useState(initialOn);
  const [type, setType] = useState<FeeType>(initialType ?? (landlord ? "one_month_rent" : "flat"));
  const [value, setValue] = useState(initialValue != null ? String(initialValue) : "");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const input =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15 disabled:opacity-60";

  if (!canEdit) {
    return (
      <div className="rounded-xl border border-black/[0.08] bg-black/[0.015] p-4">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ink/45">Service model</span>
        <p className="text-sm text-ink/80">{nonFacilitatorSummary(initialOn, initialType, initialValue)}</p>
      </div>
    );
  }

  function save() {
    setErr(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("property_id", propertyId);
    fd.set("non_facilitator", on ? "1" : "0");
    fd.set("nf_fee_type", type);
    fd.set("nf_fee_value", value);
    start(async () => {
      try {
        await setNonFacilitatorAction(fd);
        setSaved(true);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not save. Try again.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-black/[0.08] bg-black/[0.015] p-4">
      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => { setOn(e.target.checked); setSaved(false); }}
          className="h-4 w-4 accent-[#198577]"
        />
        <span className="text-sm font-semibold text-ink">Non-facilitator service (one-time fee)</span>
      </label>
      <p className="mt-1 text-xs text-ink/55">
        A single set fee instead of the standard commission. For buy/sell and landlords of year-round / winter rentals.
      </p>

      {on && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-ink/55">Fee type</label>
            <select
              value={type}
              onChange={(e) => { setType(e.target.value as FeeType); setSaved(false); }}
              disabled={pending}
              className={input}
            >
              <option value="flat">Flat amount ($)</option>
              <option value="percent">Percent (%)</option>
              {landlord && <option value="one_month_rent">One month&rsquo;s rent</option>}
            </select>
          </div>
          {type !== "one_month_rent" && (
            <div>
              <label className="mb-1 block text-xs text-ink/55">
                {type === "percent" ? "Percent" : "Amount ($)"} · one-time
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={value}
                onChange={(e) => { setValue(e.target.value); setSaved(false); }}
                disabled={pending}
                placeholder={type === "percent" ? "3" : "2500"}
                className={input}
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs font-semibold text-primary">Saved ✓</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}
