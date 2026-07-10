"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { Plus, Loader2 } from "lucide-react";
import { ROLE_LABEL } from "@/lib/auth/capabilities";
import type { PersonOption, ClientOption, PropertyOption } from "./RemindersClient";

// Valores iniciais (modo edição). Ausentes = form de criação em branco.
export type ReminderFormDefaults = {
  id: string;
  title: string;
  notes: string | null;
  assigned_to: string;
  due_date: string | null;
  client_id: string | null;
  property_id: string | null;
};

// Form inline pra criar OU editar um lembrete. Mesmo padrão glass/toggle das
// outras adds. No modo edição (defaults setado) o botão vira "Save" e um hidden
// carrega o id. Links opcionais (pessoa/propriedade) só aparecem se houver lista
// (realtor não vê clientes/propriedades → os pickers somem).
export function ReminderAddForm({
  people,
  clients,
  properties,
  action,
  defaults,
  onDone,
  autoOpen = false,
}: {
  people: PersonOption[];
  clients: ClientOption[];
  properties: PropertyOption[];
  action: (fd: FormData) => Promise<void>;
  defaults?: ReminderFormDefaults;
  // Chamado após submit com sucesso (fecha um editor inline, por ex.).
  onDone?: () => void;
  autoOpen?: boolean;
}) {
  const isEdit = !!defaults;
  const [open, setOpen] = useState(autoOpen || isEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    setBusy(true);
    try {
      const fd = new FormData(form);
      await action(fd);
      form.reset();
      setBusy(false);
      if (!isEdit) setOpen(false);
      onDone?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={buttonClass("primary")}>
        <Plus className="h-4 w-4" /> New reminder
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass mb-6 space-y-5 p-6">
      {isEdit && <input type="hidden" name="id" value={defaults!.id} />}

      <div className="flex items-center justify-between">
        <h3 className="h-display text-base text-ink">{isEdit ? "Edit reminder" : "New reminder"}</h3>
      </div>

      <Field label="Title *">
        <input
          name="title"
          required
          defaultValue={defaults?.title ?? ""}
          className={inputClass}
          placeholder="e.g. Follow up on the East Falmouth lease renewal"
          maxLength={200}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Assign to *" hint="This person is responsible; escalation follows their role.">
          <select
            name="assigned_to"
            required
            defaultValue={defaults?.assigned_to ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Select a person…
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? "Unnamed"} · {ROLE_LABEL[p.role]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Due date" hint="Optional. If set, the escalation clock counts from here.">
          <input
            name="due_date"
            type="date"
            defaultValue={defaults?.due_date ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      {(clients.length > 0 || properties.length > 0) && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {clients.length > 0 && (
            <Field label="Link a person" hint="Optional — an owner, tenant, buyer or seller.">
              <select name="client_id" defaultValue={defaults?.client_id ?? ""} className={inputClass}>
                <option value="">None</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {properties.length > 0 && (
            <Field label="Link a property" hint="Optional — attach the property this is about.">
              <select name="property_id" defaultValue={defaults?.property_id ?? ""} className={inputClass}>
                <option value="">None</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.address}
                    {p.address2 ? ` · ${p.address2}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      )}

      <Field label="Notes">
        <textarea
          name="notes"
          rows={2}
          defaultValue={defaults?.notes ?? ""}
          className={inputClass}
          placeholder="Optional — context, links, next step…"
        />
      </Field>

      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={busy} className={buttonClass("primary")}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : isEdit ? (
            "Save changes"
          ) : (
            "Add reminder"
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            if (isEdit) {
              onDone?.();
            } else {
              setOpen(false);
            }
          }}
          disabled={busy}
          className={buttonClass("ghost")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
