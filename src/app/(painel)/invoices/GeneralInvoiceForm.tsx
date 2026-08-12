"use client";

// =============================================================================
// New GENERAL invoice — a simple one-off charge. Client (bill-to autofill) +
// optional property OR typed address + date/due + repeatable line items
// (Description + Amount) with a LIVE Total. NO worker cost, NO commission,
// NO labor/material split. Number assigned by the DB trigger.
// =============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import { Field, inputClass, selectClass, buttonClass } from "@/components/ui";
import { money } from "@/lib/format";
import { round2 } from "@/lib/invoice-formula";
import type { Client, Property, Invoice } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

type Prop = Pick<Property, "id" | "owner_id" | "address" | "address2">;
type LineItem = { description: string; amount: string };

const todayISO = () => new Date().toISOString().slice(0, 10);
const ymd = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");

export function GeneralInvoiceForm({
  action,
  clients,
  properties,
  invoice,
  initialItems,
  submitLabel = "Create general invoice",
  cancelHref = "/invoices/general",
}: {
  action: (fd: FormData) => void | Promise<void>;
  clients: Client[];
  properties: Prop[];
  invoice?: Invoice;
  initialItems?: LineItem[];
  submitLabel?: string;
  cancelHref?: string;
}) {
  const [clientId, setClientId] = useState(invoice?.client_id ?? "");
  const [propertyId, setPropertyId] = useState(invoice?.property_id ?? "");
  const [items, setItems] = useState<LineItem[]>(
    initialItems && initialItems.length > 0 ? initialItems : [{ description: "", amount: "" }]
  );

  const selectedClient = clients.find((c) => c.id === clientId);
  const clientProps = clientId ? properties.filter((p) => p.owner_id === clientId) : properties;

  const total = useMemo(
    () => round2(items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)),
    [items]
  );

  function updateItem(i: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { description: "", amount: "" }]);
  }
  function removeItem(i: number) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  const billTo = selectedClient
    ? [
        selectedClient.name,
        selectedClient.email,
        selectedClient.phone,
        [selectedClient.billing_address, selectedClient.billing_address2].filter(Boolean).join(", "),
        [selectedClient.billing_city, selectedClient.billing_state, selectedClient.billing_zip].filter(Boolean).join(" "),
      ].filter(Boolean)
    : [];

  return (
    <form action={action} className="space-y-8">
      <section className="glass p-6">
        <h2 className="h-display mb-5 text-base text-ink">Bill to</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Client (bill to) *">
            <select
              name="client_id"
              required
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setPropertyId("");
              }}
              className={selectClass}
            >
              <option value="" disabled>Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Property" hint="Optional — link the charge to a property.">
            <select
              name="property_id"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className={selectClass}
            >
              <option value="">No property</option>
              {clientProps.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                  {p.address2 ? ` · ${p.address2}` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {billTo.length > 0 && (
          <div className="mt-4 rounded-xl border border-black/[0.06] bg-black/[0.015] p-4 text-sm text-ink/70">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink/45">Bill to</span>
            {billTo.map((line, i) => (
              <span key={i} className="block">{line}</span>
            ))}
          </div>
        )}

        <div className="mt-4">
          <Field label="Address (if not a saved property)">
            <input name="service_address" defaultValue={invoice?.service_address ?? ""} className={inputClass} placeholder="123 Ocean St, Hyannis MA 02601" />
          </Field>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Invoice date *">
            <input name="date" type="date" required defaultValue={ymd(invoice?.date) || todayISO()} className={inputClass} />
          </Field>
          <Field label="Due" hint="Optional.">
            <input name="due_date" type="date" defaultValue={ymd(invoice?.due_date)} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="glass p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="h-display text-base text-ink">Line items</h2>
          <button type="button" onClick={addItem} className={buttonClass("ghost")}>
            <Plus className="h-4 w-4" /> Add item
          </button>
        </div>

        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-center">
              <input
                name={`item_${i}_description`}
                value={it.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
                className={inputClass}
                placeholder="Description (e.g. Annual admin fee)"
              />
              <input
                name={`item_${i}_amount`}
                value={it.amount}
                onChange={(e) => updateItem(i, { amount: e.target.value })}
                type="number"
                step="0.01"
                className={inputClass}
                placeholder="0.00"
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-black/[0.08] text-ink/40 transition hover:border-red-300 hover:text-red-500"
                aria-label="Remove item"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-6 ml-auto max-w-xs">
          <div className="flex justify-between border-t border-black/[0.08] pt-3 text-base">
            <span className="font-semibold text-ink">Total</span>
            <span className="h-display text-primary">{money(total)}</span>
          </div>
        </div>
      </section>

      <section className="glass p-6">
        <Field label="Notes">
          <textarea name="notes" rows={2} defaultValue={invoice?.notes ?? ""} className={inputClass} placeholder="Internal or invoice notes." />
        </Field>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className={buttonClass("primary")} disabled={!clientId}>
          {submitLabel}
        </button>
        <Link href={cancelHref} className={buttonClass("ghost")}>Cancel</Link>
      </div>
    </form>
  );
}
