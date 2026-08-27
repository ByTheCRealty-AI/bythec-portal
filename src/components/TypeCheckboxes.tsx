"use client";

// =============================================================================
// TypeCheckboxes — grupo de checkboxes pra tipo de propriedade (0042) ou papel
// de cliente (0043). Substitui o dropdown de escolha única: uma casa pode ser
// temporada E inverno E estar à venda; uma pessoa pode ser landlord E vendedor.
// Cada checkbox posta value="1" com o nome da flag; o server lê com
// propertyTypeFlagsFromForm / clientRoleFlagsFromForm.
// Devolve as flags marcadas via onChange pro form mostrar/esconder seções.
// =============================================================================
import { useState } from "react";

export type TypeOption = { flag: string; label: string; hint: string };

export function TypeCheckboxes({
  options,
  defaults,
  onChange,
  legend,
  note,
}: {
  options: TypeOption[];
  defaults?: Record<string, boolean | null | undefined>;
  onChange?: (selected: Record<string, boolean>) => void;
  legend: string;
  note?: string;
}) {
  const [sel, setSel] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const o of options) init[o.flag] = !!defaults?.[o.flag];
    return init;
  });

  const none = !Object.values(sel).some(Boolean);

  function toggle(flag: string, on: boolean) {
    const next = { ...sel, [flag]: on };
    setSel(next);
    onChange?.(next);
  }

  return (
    <fieldset className="sm:col-span-2">
      <legend className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink/50">
        {legend} <span className="text-red-600">*</span>
      </legend>
      {note && <p className="mb-2.5 text-xs text-ink/45">{note}</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.flag}
            className={
              "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-2.5 transition " +
              (sel[o.flag]
                ? "border-primary/40 bg-primary/[0.06]"
                : "border-black/[0.10] bg-white hover:border-black/20")
            }
          >
            <input
              type="checkbox"
              name={o.flag}
              value="1"
              checked={!!sel[o.flag]}
              onChange={(e) => toggle(o.flag, e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-black/25 text-primary focus:ring-primary/30"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{o.label}</span>
              <span className="block text-xs text-ink/45">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {none && (
        <p className="mt-2 text-[11px] text-amber-700">
          Pick at least one. Left blank, it saves as {options[0].label}.
        </p>
      )}
    </fieldset>
  );
}
