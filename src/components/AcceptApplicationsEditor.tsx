"use client";

// "Accept rental applications on the website" direto na página da propriedade.
// Só aparece quando a casa NÃO tem inquilino (Andrea 2026-09-16); com inquilino
// (inclusive saindo) fica só no Edit property.
import { useState, useTransition } from "react";
import { setAcceptsApplicationsAction } from "@/app/(painel)/propriedades/actions";

export function AcceptApplicationsEditor({
  id,
  canEdit,
  initialYearRound,
  initialWinter,
}: {
  id: string;
  canEdit: boolean;
  initialYearRound: boolean;
  initialWinter: boolean;
}) {
  const [yr, setYr] = useState(initialYearRound);
  const [winter, setWinter] = useState(initialWinter);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    setSaved(false);
    start(async () => {
      try {
        await setAcceptsApplicationsAction(id, yr, winter);
        setSaved(true);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  return (
    <div>
      <p className="text-xs text-ink/55">
        This house has no tenant. Pick the rental type(s) it appears under on the public application form (/apply).
      </p>
      <div className="mt-3 flex flex-col gap-2.5">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink/80">
          <input
            type="checkbox"
            checked={yr}
            disabled={!canEdit}
            onChange={(e) => { setYr(e.target.checked); setSaved(false); }}
            className="h-4 w-4 accent-[#198577]"
          />
          Year-round rental
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink/80">
          <input
            type="checkbox"
            checked={winter}
            disabled={!canEdit}
            onChange={(e) => { setWinter(e.target.checked); setSaved(false); }}
            className="h-4 w-4 accent-[#198577]"
          />
          Winter / off-season rental
        </label>
      </div>
      {canEdit && (
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
      )}
    </div>
  );
}
