"use client";

// =============================================================================
// NonFacilitatorEditor — "Non-Client Facilitator": SUB-TIPO (tag em cima do tipo)
// pra cliente/property onde a By the C fez um serviço ÚNICO (achar inquilino /
// facilitar venda) por uma taxa única, e o dono gerencia o resto sozinho.
// Mesmo componente serve na página do CLIENTE e da PROPERTY (entity define qual
// action grava). fee_type: percent (%) | flat ($) | one_month_rent (só landlord).
// =============================================================================

import { useState, useTransition } from "react";
import { setNonFacilitatorAction } from "@/app/(painel)/propriedades/actions";
import { setClientNonFacilitatorAction } from "@/app/(painel)/clientes/actions";

type FeeType = "percent" | "flat" | "one_month_rent";

// Texto curto do estado atual (usado em badges/leitura).
export function nonFacilitatorSummary(
  on: boolean,
  type: FeeType | null,
  value: number | null
): string {
  if (!on) return "Standard (By the C manages)";
  if (type === "one_month_rent") return "Non-Client Facilitator · one month's rent (one-time)";
  if (type === "percent") return `Non-Client Facilitator · ${value ?? 0}% one-time`;
  if (type === "flat") return `Non-Client Facilitator · $${(value ?? 0).toLocaleString("en-US")} one-time`;
  return "Non-Client Facilitator (one-time fee)";
}

export function NonFacilitatorEditor({
  entity,
  id,
  canEdit,
  initialOn,
  initialType,
  initialValue,
  landlord = false,
}: {
  entity: "property" | "client";
  id: string;
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
    fd.set(entity === "client" ? "client_id" : "property_id", id);
    fd.set("non_facilitator", on ? "1" : "0");
    fd.set("nf_fee_type", type);
    fd.set("nf_fee_value", value);
    start(async () => {
      try {
        if (entity === "client") await setClientNonFacilitatorAction(fd);
        else await setNonFacilitatorAction(fd);
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
        <span className="text-sm font-semibold text-ink">Non-Client Facilitator</span>
      </label>
      <p className="mt-1 text-xs text-ink/55">
        One-time service only (find a tenant / facilitate the sale) for a single set fee — the owner manages the
        property and tenant themselves. Not a full managed client. Tag it on top of their type (landlord or buy/sell).
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
