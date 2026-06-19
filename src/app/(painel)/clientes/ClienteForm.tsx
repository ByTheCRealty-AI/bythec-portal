"use client";

import { Field, inputClass, buttonClass } from "@/components/ui";
import { PhoneInput, AddressFields } from "@/components/form-fields";
import { CLIENT_TYPE_LABEL, DEAL_SIDE_LABEL } from "@/lib/types";
import type { Client } from "@/lib/types";
import Link from "next/link";

// Field names das colunas de billing no banco (clients) pro AddressFields.
const BILLING_ADDRESS_NAMES = {
  line1: "billing_address",
  line2: "billing_address2",
  city: "billing_city",
  state: "billing_state",
  zip: "billing_zip",
} as const;

// Formulário compartilhado (criar/editar cliente). `action` é o server action.
export function ClienteForm({
  client,
  action,
  submitLabel,
  cancelHref,
}: {
  client?: Client;
  action: (fd: FormData) => void | Promise<void>;
  submitLabel: string;
  cancelHref: string;
}) {
  return (
    <form action={action} className="space-y-8">
      {/* Identificação */}
      <section className="glass p-6">
        <h2 className="h-display mb-5 text-base text-ink">Identification</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Name *">
            <input name="name" required defaultValue={client?.name ?? ""} className={inputClass} placeholder="Client name" />
          </Field>
          <Field label="Client type *" hint="Primary role. Extra roles can be assigned later without losing history.">
            <select name="client_type" required defaultValue={client?.client_type ?? ""} className={inputClass}>
              <option value="" disabled>Select…</option>
              {Object.entries(CLIENT_TYPE_LABEL).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Deal side" hint="Buyer/seller only.">
            <select name="deal_side" defaultValue={client?.deal_side ?? ""} className={inputClass}>
              <option value="">—</option>
              {Object.entries(DEAL_SIDE_LABEL).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Email">
            <input name="email" type="email" defaultValue={client?.email ?? ""} className={inputClass} placeholder="name@email.com" />
          </Field>
          <Field label="Phone">
            <PhoneInput name="phone" defaultValue={client?.phone} />
          </Field>
        </div>
      </section>

      {/* Endereço de cobrança */}
      <section className="glass p-6">
        <h2 className="h-display mb-2 text-base text-ink">Billing address</h2>
        <p className="mb-5 text-xs text-ink/45">From our records, with unit number. Never from Google.</p>
        <AddressFields
          names={BILLING_ADDRESS_NAMES}
          defaults={{
            line1: client?.billing_address,
            line2: client?.billing_address2,
            city: client?.billing_city,
            state: client?.billing_state,
            zip: client?.billing_zip,
          }}
        />
      </section>

      {/* Co-cliente */}
      <section className="glass p-6">
        <h2 className="h-display mb-5 text-base text-ink">Co-client <span className="text-sm font-normal text-ink/45">(spouse / partner on the name)</span></h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Name">
            <input name="co_client_name" defaultValue={client?.co_client_name ?? ""} className={inputClass} />
          </Field>
          <Field label="Email">
            <input name="co_client_email" type="email" defaultValue={client?.co_client_email ?? ""} className={inputClass} />
          </Field>
          <Field label="Phone">
            <PhoneInput name="co_client_phone" defaultValue={client?.co_client_phone} />
          </Field>
        </div>
      </section>

      {/* Preferências + notas */}
      <section className="glass p-6">
        <h2 className="h-display mb-5 text-base text-ink">Preferences and notes</h2>
        <div className="mb-5 flex flex-wrap gap-6">
          <label className="flex items-center gap-2.5 text-sm text-ink/80">
            <input type="checkbox" name="email_notifications" defaultChecked={client?.email_notifications ?? true} className="h-4 w-4 accent-[#198577]" />
            Email notifications
          </label>
          <label className="flex items-center gap-2.5 text-sm text-ink/80">
            <input type="checkbox" name="sms_notifications" defaultChecked={client?.sms_notifications ?? false} className="h-4 w-4 accent-[#198577]" />
            SMS notifications
          </label>
        </div>
        <Field label="Internal notes">
          <textarea name="notes" rows={3} defaultValue={client?.notes ?? ""} className={inputClass} placeholder="Notes that won't be shared with the client." />
        </Field>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className={buttonClass("primary")}>{submitLabel}</button>
        <Link href={cancelHref} className={buttonClass("ghost")}>Cancel</Link>
      </div>
    </form>
  );
}
