"use client";

// Add a security deposit to a PAST tenant of this property. Deposit-only mini form
// (total → installments → first due date → notes). Submits to addSecurityDepositAction
// with a hidden tenant_id; the server validates that tenant belongs to this property.
import { useRef, useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { Plus, Loader2 } from "lucide-react";

export function PastTenantDepositForm({
  propertyId,
  tenantId,
  tenantName,
  action,
}: {
  propertyId: string;
  tenantId: string;
  tenantName: string;
  action: (fd: FormData) => void | Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await action(new FormData(e.currentTarget));
      formRef.current?.reset();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-black/15 bg-black/[0.02] px-2.5 py-1.5 text-xs font-semibold text-ink/70 transition hover:border-black/30 hover:text-ink"
      >
        <Plus className="h-3.5 w-3.5" /> Add security deposit
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="mt-3 space-y-4 rounded-xl border border-black/[0.1] bg-white p-4"
    >
      <input type="hidden" name="property_id" value={propertyId} />
      <input type="hidden" name="tenant_id" value={tenantId} />
      <p className="text-xs text-ink/55">
        Security deposit for <span className="font-semibold text-ink/80">{tenantName}</span> (past tenant)
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Total deposit amount (USD)" hint="Whole dollars. Split evenly; remainder on the earliest installments.">
          <input name="deposit_total" type="number" step="1" min={1} required className={inputClass} placeholder="2300" />
        </Field>
        <Field label="Number of installments">
          <input name="installment_total" type="number" step="1" min={1} max={24} defaultValue={3} className={inputClass} />
        </Field>
        <Field label="First due date" hint="Following installments fall on the same day each month.">
          <input name="first_due_date" type="date" required className={inputClass} />
        </Field>
        <Field label="Notes">
          <input name="notes" className={inputClass} placeholder="Optional" />
        </Field>
      </div>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={busy} className={buttonClass("primary")}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Adding…
            </>
          ) : (
            "Add deposit"
          )}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
