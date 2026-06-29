"use client";

// =============================================================================
// New SERVICE invoice — client (bill-to autofill) + property OR typed service
// address + date/due + repeatable line items (Description + Amount + Labor/Material)
// with LIVE Total Labor / Total Material / Total. Number assigned by DB trigger.
// =============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import { Field, inputClass, selectClass, buttonClass } from "@/components/ui";
import { money } from "@/lib/format";
import { round2 } from "@/lib/invoice-formula";
import { INVOICE_ITEM_CATEGORY_LABEL, type Client, type Property, type Invoice, type InvoiceItemCategory } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

type Prop = Pick<Property, "id" | "owner_id" | "address" | "address2" | "seasonal_commission_rate">;
type LineItem = { description: string; amount: string; category: InvoiceItemCategory };

const todayISO = () => new Date().toISOString().slice(0, 10);
const ymd = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");

export function ServiceInvoiceForm({
  action,
  clients,
  properties,
  invoice,
  initialItems,
  submitLabel = "Create service invoice",
  cancelHref = "/invoices",
}: {
  action: (fd: FormData) => void | Promise<void>;
  clients: Client[];
  properties: Prop[];
  // Modo edição: pré-preenche o form com a invoice existente + seus itens.
  invoice?: Invoice;
  initialItems?: LineItem[];
  submitLabel?: string;
  cancelHref?: string;
}) {
  const [clientId, setClientId] = useState(invoice?.client_id ?? "");
  const [propertyId, setPropertyId] = useState(invoice?.property_id ?? "");
  const [items, setItems] = useState<LineItem[]>(
    initialItems && initialItems.length > 0
      ? initialItems
      : [{ description: "", amount: "", category: "labor" }]
  );

  const selectedClient = clients.find((c) => c.id === clientId);
  // Propriedades do cliente selecionado (se houver); senão todas.
  const clientProps = clientId ? properties.filter((p) => p.owner_id === clientId) : properties;

  const totals = useMemo(() => {
    let labor = 0;
    let material = 0;
    for (const it of items) {
      const v = Number(it.amount) || 0;
      if (it.category === "labor") labor += v;
      else material += v;
    }
    return { labor: round2(labor), material: round2(material), total: round2(labor + material) };
  }, [items]);

  function updateItem(i: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { description: "", amount: "", category: "labor" }]);
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
      {/* Bill to + service address */}
      <section className="glass p-6">
        <h2 className="h-display mb-5 text-base text-ink">Bill to and service address</h2>
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
          <Field label="Property" hint="Optional — or type the service address below.">
            <select
              name="property_id"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className={selectClass}
            >
              <option value="">No property / typed address</option>
              {clientProps.map((p) => (
                <option key={p.id} value={p.id}>{p.address}</option>
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
          <Field label="Service address (if not a saved property)">
            <input name="service_address" defaultValue={invoice?.service_address ?? ""} className={inputClass} placeholder="123 Ocean St, Hyannis MA 02601" />
          </Field>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Invoice date *">
            <input name="date" type="date" required defaultValue={ymd(invoice?.date) || todayISO()} className={inputClass} />
          </Field>
          <Field label="Due" hint="Service invoices are typically due when received.">
            <input name="due_date" type="date" defaultValue={ymd(invoice?.due_date)} className={inputClass} />
          </Field>
        </div>
      </section>

      {/* Line items */}
      <section className="glass p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="h-display text-base text-ink">Line items</h2>
          <button type="button" onClick={addItem} className={buttonClass("ghost")}>
            <Plus className="h-4 w-4" /> Add item
          </button>
        </div>

        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem_9rem_auto] sm:items-center">
              <input
                name={`item_${i}_description`}
                value={it.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
                className={inputClass}
                placeholder="Description (e.g. Replace faucet)"
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
              <select
                name={`item_${i}_category`}
                value={it.category}
                onChange={(e) => updateItem(i, { category: e.target.value as InvoiceItemCategory })}
                className={selectClass}
              >
                {Object.entries(INVOICE_ITEM_CATEGORY_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
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

        {/* Live totals */}
        <div className="mt-6 ml-auto max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-ink/65">
            <span>Total Labor</span>
            <span className="font-semibold text-ink">{money(totals.labor)}</span>
          </div>
          <div className="flex justify-between text-ink/65">
            <span>Total Material</span>
            <span className="font-semibold text-ink">{money(totals.material)}</span>
          </div>
          <div className="flex justify-between border-t border-black/[0.08] pt-2 text-base">
            <span className="font-semibold text-ink">Total</span>
            <span className="h-display text-primary">{money(totals.total)}</span>
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
