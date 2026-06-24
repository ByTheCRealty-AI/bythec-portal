"use client";

import { useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { Plus } from "lucide-react";

// Form inline pra adicionar uma nota direto da aba Notes do detalhe (cliente ou
// propriedade). Reusado nos dois via props: parentType ('client' | 'property'),
// parentId (entidade-mãe) e action (server action correspondente). Mesmo padrão
// toggle do PropriedadeForm: botão "+ Add note" revela o form em glass, fecha
// e revalida (server) no submit bem-sucedido.
export function NoteAddForm({
  parentType,
  parentId,
  action,
}: {
  parentType: "client" | "property";
  parentId: string;
  action: (fd: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const target = parentType === "client" ? "client" : "property";

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={buttonClass("primary")}>
        <Plus className="h-4 w-4" /> Add note
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await action(fd);
        setOpen(false);
      }}
      className="glass space-y-5 p-6"
    >
      <input type="hidden" name="parent_id" value={parentId} />
      <div className="flex items-center justify-between">
        <h3 className="h-display text-base text-ink">New note</h3>
        <span className="text-xs text-ink/45">Attached to this {target}</span>
      </div>

      <Field label="Note *" hint="Internal note. Not shared with the client.">
        <textarea
          name="body"
          required
          rows={3}
          className={inputClass}
          placeholder="Write a note…"
        />
      </Field>

      <div className="sm:max-w-[12rem]">
        <Field label="Year" hint="Defaults to the current year.">
          <input
            name="year"
            type="number"
            min={2000}
            max={2100}
            defaultValue={currentYear}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex gap-3">
        <button type="submit" className={buttonClass("primary")}>
          Add note
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
