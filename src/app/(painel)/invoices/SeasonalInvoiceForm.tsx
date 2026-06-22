"use client";

// =============================================================================
// New SEASONAL invoice — owner (client) + property (loads commission %), platform,
// guest name, dates. Guest-side + owner-side inputs + repeatable extra deductions
// + editable commission % + cleaning destination toggle. LIVE computes
// Total Paid by Guest / By the C Commission / Total Received by Owner using the
// SHARED locked formula (src/lib/invoice-formula.ts) — identical to the server.
// =============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import { Field, inputClass, selectClass, buttonClass } from "@/components/ui";
import { money } from "@/lib/format";
import { computeSeasonal } from "@/lib/invoice-formula";
import {
  INVOICE_PLATFORMS,
  CLEANING_DESTINATION_LABEL,
  type Client,
  type Property,
  type CleaningDestination,
} from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

type Prop = Pick<Property, "id" | "owner_id" | "address" | "address2" | "seasonal_commission_rate">;
type Extra = { description: string; amount: string };

const todayISO = () => new Date().toISOString().slice(0, 10);
const n = (s: string) => Number(s) || 0;

export function SeasonalInvoiceForm({
  action,
  clients,
  properties,
}: {
  action: (fd: FormData) => void | Promise<void>;
  clients: Client[];
  properties: Prop[];
}) {
  const [clientId, setClientId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [platform, setPlatform] = useState<string>("Airbnb");
  const [cleaningGoesTo, setCleaningGoesTo] = useState<CleaningDestination>("owner");

  // Guest side
  const [roomFee, setRoomFee] = useState("");
  const [rentalNights, setRentalNights] = useState("");
  const [rentalDiscount, setRentalDiscount] = useState("");
  const [cleaningFee, setCleaningFee] = useState("");
  const [guestServiceFee, setGuestServiceFee] = useState("");
  const [occupancyTaxes, setOccupancyTaxes] = useState("");
  const [vrboPropertyDamage, setVrboPropertyDamage] = useState("");

  // Owner side
  const [hostPayout, setHostPayout] = useState("");
  const [hostServiceFee, setHostServiceFee] = useState("");
  const [commissionPct, setCommissionPct] = useState("10"); // em %, default 10
  const [extras, setExtras] = useState<Extra[]>([]);

  const clientProps = clientId ? properties.filter((p) => p.owner_id === clientId) : properties;
  const isVrbo = platform === "VRBO";

  function onSelectProperty(id: string) {
    setPropertyId(id);
    const p = properties.find((x) => x.id === id);
    if (p && p.seasonal_commission_rate != null) {
      setCommissionPct(String(round1(p.seasonal_commission_rate * 100)));
    }
  }

  const computed = useMemo(() => {
    return computeSeasonal({
      room_fee: n(roomFee),
      rental_discount: n(rentalDiscount),
      cleaning_fee: n(cleaningFee),
      guest_service_fee: n(guestServiceFee),
      occupancy_taxes: n(occupancyTaxes),
      vrbo_property_damage: isVrbo ? n(vrboPropertyDamage) : 0,
      host_payout: n(hostPayout),
      host_service_fee: n(hostServiceFee),
      commission_rate: n(commissionPct) / 100,
      cleaning_goes_to: cleaningGoesTo,
      extra_deductions: extras.map((e) => n(e.amount)),
    });
  }, [
    roomFee, rentalDiscount, cleaningFee, guestServiceFee, occupancyTaxes,
    vrboPropertyDamage, isVrbo, hostPayout, hostServiceFee, commissionPct,
    cleaningGoesTo, extras,
  ]);

  function addExtra() {
    setExtras((p) => [...p, { description: "", amount: "" }]);
  }
  function updateExtra(i: number, patch: Partial<Extra>) {
    setExtras((p) => p.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function removeExtra(i: number) {
    setExtras((p) => p.filter((_, idx) => idx !== i));
  }

  return (
    <form action={action} className="space-y-8">
      {/* hidden mirror of computed commission_rate fraction (server recomputes anyway) */}
      <input type="hidden" name="commission_rate" value={String(n(commissionPct) / 100)} />
      <input type="hidden" name="cleaning_goes_to" value={cleaningGoesTo} />
      <input type="hidden" name="platform" value={platform} />

      {/* Reservation */}
      <section className="glass p-6">
        <h2 className="h-display mb-5 text-base text-ink">Reservation details</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Owner (client) *">
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
              <option value="" disabled>Select owner…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Property *" hint="Loads its By the C commission %.">
            <select
              name="property_id"
              required
              value={propertyId}
              onChange={(e) => onSelectProperty(e.target.value)}
              className={selectClass}
            >
              <option value="" disabled>Select property…</option>
              {clientProps.map((p) => (
                <option key={p.id} value={p.id}>{p.address}</option>
              ))}
            </select>
          </Field>
          <Field label="Platform *">
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={selectClass}>
              {INVOICE_PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Guest name">
            <input name="guest_name" className={inputClass} placeholder="Guest full name" />
          </Field>
          <Field label="Check-in">
            <input name="dates_reserved_start" type="date" className={inputClass} />
          </Field>
          <Field label="Check-out">
            <input name="dates_reserved_end" type="date" className={inputClass} />
          </Field>
          <Field label="Invoice date *">
            <input name="date" type="date" required defaultValue={todayISO()} className={inputClass} />
          </Field>
          <Field label="Due">
            <input name="due_date" type="date" className={inputClass} />
          </Field>
        </div>
      </section>

      {/* Two columns: Paid by Guest + Owner Overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Paid by Guest */}
        <section className="glass p-6">
          <h2 className="h-display mb-5 text-base text-ink">Paid by Guest</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Rental Nights ($)">
                <input name="room_fee" value={roomFee} onChange={(e) => setRoomFee(e.target.value)} type="number" step="0.01" className={inputClass} placeholder="0.00" />
              </Field>
              <Field label="# Nights">
                <input name="rental_nights" value={rentalNights} onChange={(e) => setRentalNights(e.target.value)} type="number" className={inputClass} placeholder="0" />
              </Field>
            </div>
            <Field label="Rental Discount ($)" hint="Subtracted from the guest total.">
              <input name="rental_discount" value={rentalDiscount} onChange={(e) => setRentalDiscount(e.target.value)} type="number" step="0.01" className={inputClass} placeholder="0.00" />
            </Field>
            <Field label="Cleaning Fee ($)">
              <input name="cleaning_fee" value={cleaningFee} onChange={(e) => setCleaningFee(e.target.value)} type="number" step="0.01" className={inputClass} placeholder="0.00" />
            </Field>
            <Field label="Guest Service Fee ($)">
              <input name="guest_service_fee" value={guestServiceFee} onChange={(e) => setGuestServiceFee(e.target.value)} type="number" step="0.01" className={inputClass} placeholder="0.00" />
            </Field>
            <Field label={isVrbo ? "Lodging Taxes ($)" : "Occupancy Taxes ($)"}>
              <input name="occupancy_taxes" value={occupancyTaxes} onChange={(e) => setOccupancyTaxes(e.target.value)} type="number" step="0.01" className={inputClass} placeholder="0.00" />
            </Field>
            {isVrbo && (
              <Field label="Property Damage Protection ($)" hint="VRBO only.">
                <input name="vrbo_property_damage" value={vrboPropertyDamage} onChange={(e) => setVrboPropertyDamage(e.target.value)} type="number" step="0.01" className={inputClass} placeholder="0.00" />
              </Field>
            )}
          </div>
          <div className="mt-5 flex justify-between border-t border-black/[0.08] pt-3 text-base">
            <span className="font-semibold text-ink">Total Paid by Guest</span>
            <span className="h-display text-secondary">{money(computed.total_paid_by_guest)}</span>
          </div>
        </section>

        {/* Owner Overview */}
        <section className="glass p-6">
          <h2 className="h-display mb-5 text-base text-ink">Owner Overview</h2>
          <div className="space-y-4">
            <Field label="Host Payout ($)" hint="What the platform pays out to the host.">
              <input name="host_payout" value={hostPayout} onChange={(e) => setHostPayout(e.target.value)} type="number" step="0.01" className={inputClass} placeholder="0.00" />
            </Field>
            <Field label="Platform Host Service Fee ($)">
              <input name="host_service_fee" value={hostServiceFee} onChange={(e) => setHostServiceFee(e.target.value)} type="number" step="0.01" className={inputClass} placeholder="0.00" />
            </Field>
            <Field label="By the C Commission %" hint="Defaults from the property. Editable per invoice.">
              <input value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} type="number" step="0.1" className={inputClass} placeholder="10" />
            </Field>
            <Field label="Cleaning fee destination">
              <select value={cleaningGoesTo} onChange={(e) => setCleaningGoesTo(e.target.value as CleaningDestination)} className={selectClass}>
                {Object.entries(CLEANING_DESTINATION_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </Field>

            {/* Extra deductions */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink/50">Extra deductions</span>
                <button type="button" onClick={addExtra} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
              <div className="space-y-2">
                {extras.map((ex, i) => (
                  <div key={i} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                    <input
                      name={`extra_${i}_description`}
                      value={ex.description}
                      onChange={(e) => updateExtra(i, { description: e.target.value })}
                      className={inputClass}
                      placeholder="e.g. Hot Tub Maintenance"
                    />
                    <input
                      name={`extra_${i}_amount`}
                      value={ex.amount}
                      onChange={(e) => updateExtra(i, { amount: e.target.value })}
                      type="number"
                      step="0.01"
                      className={inputClass}
                      placeholder="0.00"
                    />
                    <button
                      type="button"
                      onClick={() => removeExtra(i)}
                      className="grid h-10 w-10 place-items-center rounded-xl border border-black/[0.08] text-ink/40 transition hover:border-red-300 hover:text-red-500"
                      aria-label="Remove deduction"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {extras.length === 0 && (
                  <p className="text-xs text-ink/40">No extra deductions.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-1.5 border-t border-black/[0.08] pt-3 text-sm">
            <div className="flex justify-between text-ink/65">
              <span>By the C Commission</span>
              <span className="font-semibold text-ink">{money(computed.bythec_commission)}</span>
            </div>
            <div className="flex justify-between text-base">
              <span className="font-semibold text-ink">Total Received by Owner</span>
              <span className="h-display text-primary">{money(computed.total_received_by_owner)}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="glass p-6">
        <Field label="Notes">
          <textarea name="notes" rows={2} className={inputClass} placeholder="Internal or invoice notes." />
        </Field>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className={buttonClass("primary")} disabled={!clientId || !propertyId}>
          Create seasonal invoice
        </button>
        <Link href="/invoices" className={buttonClass("ghost")}>Cancel</Link>
      </div>
    </form>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
