"use client";

// Editor do checklist padrão: por seção, renomear (salva ao sair do campo),
// ativar/desativar, subir/descer e adicionar item (inclusive seção nova).
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui";
import { cx } from "@/lib/format";
import { groupBySection, type InspectionTemplateItem } from "@/lib/inspections";
import {
  addTemplateItemAction,
  renameTemplateItemAction,
  setTemplateItemActiveAction,
  moveTemplateItemAction,
} from "./actions";

type Run = (fn: () => Promise<void>) => void;

function TemplateRow({
  item,
  first,
  last,
  run,
}: {
  item: InspectionTemplateItem;
  first: boolean;
  last: boolean;
  run: Run;
}) {
  const [label, setLabel] = useState(item.label);
  const iconBtn =
    "grid h-8 w-8 place-items-center rounded-lg border border-black/[0.08] bg-white text-ink/55 transition hover:border-primary/40 hover:text-primary disabled:opacity-30";
  return (
    <li className={cx("flex items-center gap-2 px-3 py-2", !item.active && "bg-black/[0.02]")}>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          if (label.trim() && label.trim() !== item.label) run(() => renameTemplateItemAction(item.id, label));
          else setLabel(item.label);
        }}
        className={cx(inputClass, "py-2", !item.active && "text-ink/40 line-through")}
      />
      <button type="button" disabled={first} onClick={() => run(() => moveTemplateItemAction(item.id, "up"))} className={iconBtn} aria-label="Move up">
        <ArrowUp className="h-4 w-4" />
      </button>
      <button type="button" disabled={last} onClick={() => run(() => moveTemplateItemAction(item.id, "down"))} className={iconBtn} aria-label="Move down">
        <ArrowDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => run(() => setTemplateItemActiveAction(item.id, !item.active))}
        className={iconBtn}
        aria-label={item.active ? "Deactivate" : "Activate"}
        title={item.active ? "Active — tap to hide from new inspections" : "Hidden — tap to use again"}
      >
        {item.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
    </li>
  );
}

function AddItem({ section, run }: { section: string; run: Run }) {
  const [label, setLabel] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return;
        const value = label;
        setLabel("");
        run(() => addTemplateItemAction(section, value));
      }}
      className="flex gap-2 px-3 py-2"
    >
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={`Add item to ${section}`}
        className={cx(inputClass, "py-2")}
      />
      <button type="submit" className={buttonClass("ghost")} aria-label={`Add item to ${section}`}>
        <Plus className="h-4 w-4" />
      </button>
    </form>
  );
}

export function ChecklistClient({ items }: { items: InspectionTemplateItem[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newSection, setNewSection] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const run: Run = (fn) => {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Try again.");
      }
    });
  };

  const groups = groupBySection(items);

  return (
    <div className="space-y-5">
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {pending && <p className="text-xs text-ink/45">Saving…</p>}

      {groups.map((g) => {
        const activeCount = g.items.filter((i) => i.active).length;
        return (
          <section key={g.section} className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-card">
            <div className="flex items-center justify-between bg-primary/[0.06] px-4 py-2.5">
              <h2 className="text-sm font-semibold text-primary">{g.section}</h2>
              <span className="text-xs text-ink/50">
                {activeCount} active{g.items.length > activeCount ? ` · ${g.items.length - activeCount} hidden` : ""}
              </span>
            </div>
            <ul className="divide-y divide-black/[0.05]">
              {g.items.map((item, idx) => (
                <TemplateRow
                  key={`${item.id}:${item.label}`}
                  item={item}
                  first={idx === 0}
                  last={idx === g.items.length - 1}
                  run={run}
                />
              ))}
            </ul>
            <div className="border-t border-black/[0.05]">
              <AddItem section={g.section} run={run} />
            </div>
          </section>
        );
      })}

      {/* Seção nova */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!newSection.trim() || !newLabel.trim()) {
            setError("Enter the new section name and its first item.");
            return;
          }
          const sec = newSection;
          const lab = newLabel;
          setNewSection("");
          setNewLabel("");
          run(() => addTemplateItemAction(sec, lab));
        }}
        className="space-y-3 rounded-2xl border border-dashed border-black/[0.15] bg-black/[0.015] p-4"
      >
        <p className="text-sm font-semibold text-ink/70">New section</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="Section (e.g. Laundry)" className={inputClass} />
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="First item (e.g. Washer)" className={inputClass} />
          <button type="submit" className={buttonClass("primary")}>
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </form>
    </div>
  );
}
