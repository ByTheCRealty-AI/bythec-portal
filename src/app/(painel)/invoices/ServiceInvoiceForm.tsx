"use client";

// =============================================================================
// New SERVICE invoice — client (bill-to autofill) + property OR typed service
// address + optional worker/provider + work date + invoice date + repeatable
// line items.
//
// Andrea enters the WORKER'S COST per line (labor or material). By the C's 10%
// commission is BAKED INTO the owner price (never a separate line on the PDF):
//   owner price = round(cost * 1.10, 2).
// Live panel shows Worker cost (labor/material), Your commission (10%), and the
// Owner total (what the owner pays). The math is the locked `serviceBilled`.
// =============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import { Field, inputClass, selectClass, buttonClass } from "@/components/ui";
import { money } from "@/lib/format";
import { round2, serviceBilled } from "@/lib/invoice-formula";
import { INVOICE_ITEM_CATEGORY_LABEL, type Client, type Property, type Invoice, type InvoiceItemCategory } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

type Prop = Pick<Property, "id" | "owner_id" | "address" | "address2" | "seasonal_commission_rate">;
type ProviderOption = { id: string; name: string };
// amount = WORKER COST (não o preço ao owner). O preço ao owner é cost*1.10.
type LineItem = { description: string; amount: string; category: InvoiceItemCategory };

const todayISO = () => new Date().toISOString().slice(0, 10);
const ymd = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");

export function ServiceInvoiceForm({
  action,
  clients,
  properties,
  providers = [],
  invoice,
  initialItems,
  submitLabel = "Create service invoice",
  cancelHref = "/invoices",
}: {
  action: (fd: FormData) => void | Promise<void>;
  clients: Client[];
  properties: Prop[];
  providers?: ProviderOption[];
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

  // Totais: custo do worker (labor/material), comissão (10%) e total ao owner.
  const totals = useMemo(() => {
    let laborCost = 0;
    let materialCost = 0;
    let laborBilled = 0;
    let materialBilled = 0;
    for (const it of items) {
      const cost = Number(it.amount) || 0;
      const billed = serviceBilled(cost);
      if (it.category === "labor") {
        laborCost += cost;
        laborBilled += billed;
      } else {
        materialCost += cost;
        materialBilled += billed;
      }
    }
    const ownerTotal = round2(laborBilled + materialBilled);
    const workerCost = round2(laborCost + materialCost);
    return {
      laborCost: round2(laborCost),
      materialCost: round2(materialCost),
      workerCost,
      commission: round2(ownerTotal - workerCost),
      ownerTotal,
    };
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
          <Field label="Service address (if not a saved property)">
            <input name="service_address" defaultValue={invoice?.service_address ?? ""} className={inputClass} placeholder="123 Ocean St, Hyannis MA 02601" />
          </Field>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Date of work" hint="When the job was done.">
            <input name="work_date" type="date" defaultValue={ymd(invoice?.work_date)} className={inputClass} />
          </Field>
          <Field label="Invoice date *" hint="When the invoice is created.">
            <input name="date" type="date" required defaultValue={ymd(invoice?.date) || todayISO()} className={inputClass} />
          </Field>
          <Field label="Due" hint="Typically due when received.">
            <input name="due_date" type="date" defaultValue={ymd(invoice?.due_date)} className={inputClass} />
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Worker / provider" hint="Optional — who did the work (for your records + 1099s). Leave blank for in-house crew.">
            <select name="provider_id" defaultValue={invoice?.provider_id ?? ""} className={selectClass}>
              <option value="">In-house / not tracked</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {/* Line items */}
      <section className="glass p-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="h-display text-base text-ink">Line items</h2>
          <button type="button" onClick={addItem} className={buttonClass("ghost")}>
            <Plus className="h-4 w-4" /> Add item
          </button>
        </div>
        <p className="mb-5 text-xs text-ink/55">
          Enter the <span className="font-semibold text-ink/70">worker&rsquo;s cost</span>. Your 10% commission is added
          automatically and included in the price the owner sees.
        </p>

        {/* Column header */}
        <div className="hidden gap-3 px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink/40 sm:grid sm:grid-cols-[1fr_8rem_9rem_7rem_auto]">
          <span>Description</span>
          <span>Worker cost</span>
          <span>Type</span>
          <span className="text-right">Owner price (+10%)</span>
          <span />
        </div>

        <div className="space-y-3">
          {items.map((it, i) => {
            const cost = Number(it.amount) || 0;
            const billed = it.amount.trim() === "" ? null : serviceBilled(cost);
            return (
              <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem_9rem_7rem_auto] sm:items-center">
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
                <span className="text-right text-sm font-semibold text-ink/70 tabular-nums">
                  {billed == null ? "—" : money(billed)}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-black/[0.08] text-ink/40 transition hover:border-red-300 hover:text-red-500"
                  aria-label="Remove item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Live totals */}
        <div className="mt-6 ml-auto max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-ink/65">
            <span>Worker cost — Labor</span>
            <span className="font-semibold text-ink">{money(totals.laborCost)}</span>
          </div>
          <div className="flex justify-between text-ink/65">
            <span>Worker cost — Material</span>
            <span className="font-semibold text-ink">{money(totals.materialCost)}</span>
          </div>
          <div className="flex justify-between text-ink/65">
            <span>Your commission (10%)</span>
            <span className="font-semibold text-secondary">{money(totals.commission)}</span>
          </div>
          <div className="flex justify-between border-t border-black/[0.08] pt-2 text-base">
            <span className="font-semibold text-ink">Owner pays (Total)</span>
            <span className="h-display text-primary">{money(totals.ownerTotal)}</span>
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
