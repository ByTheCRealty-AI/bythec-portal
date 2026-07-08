"use client";

// Trocar/definir o inquilino de um aluguel (year-round/off-season) num passo só:
// escolhe cliente existente OU cria novo, grava as datas do contrato, e
// opcionalmente gera os pagamentos mensais + arquiva o inquilino anterior.
// Aparece na aba Overview, seção Tenant (gated por properties.edit).
import { useState, useTransition } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { cx } from "@/lib/format";
import { UserPlus, Check, Loader2 } from "lucide-react";
import { assignTenancyAction, clearPropertyTenantAction } from "../actions";

type ClientOpt = { id: string; name: string };

export function TenancyForm({
  propertyId,
  currentTenant,
  clients,
  lease,
}: {
  propertyId: string;
  currentTenant: { id: string; name: string } | null;
  clients: ClientOpt[];
  lease: {
    rentPrice: number | null;
    rentDueDay: number | null;
    rentalStart: string | null;
    rentalEnd: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("property_id", propertyId);
    fd.set("tenant_mode", mode);
    if (mode === "existing" && !fd.get("tenant_id")) {
      setError("Pick a client to set as the tenant.");
      return;
    }
    if (mode === "new" && !((fd.get("new_name") as string) ?? "").trim()) {
      setError("Enter the new tenant's name.");
      return;
    }
    start(async () => {
      try {
        await assignTenancyAction(fd);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      }
    });
  }

  function makeVacant() {
    if (!confirm("Make this property vacant (remove the current tenant)? Payment history is kept.")) return;
    setError(null);
    start(async () => {
      try {
        await clearPropertyTenantAction(propertyId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update. Try again.");
      }
    });
  }

  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className={buttonClass("ghost")}
        >
          <UserPlus className="h-4 w-4" /> {currentTenant ? "Change tenant" : "Assign tenant"}
        </button>
        {currentTenant && (
          <button
            type="button"
            onClick={makeVacant}
            disabled={pending}
            className="text-xs text-ink/45 underline transition hover:text-ink/70"
          >
            Make vacant
          </button>
        )}
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-5 rounded-xl border border-black/[0.08] bg-black/[0.015] p-5">
      <h4 className="h-display text-sm text-ink">New tenancy</h4>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink/60">Who's the tenant?</label>
        <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-black/10">
          {(["existing", "new"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cx(
                "px-3.5 py-1.5 text-xs font-semibold transition",
                mode === m ? "bg-primary/10 text-primary" : "bg-white text-ink/55 hover:text-ink"
              )}
            >
              {m === "existing" ? "Existing client" : "New tenant"}
            </button>
          ))}
        </div>
        {mode === "existing" ? (
          <Field label="Client *" hint="The client to set as the tenant.">
            <select name="tenant_id" defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select a client…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name *">
              <input name="new_name" className={inputClass} placeholder="Full name" />
            </Field>
            <Field label="Email">
              <input name="new_email" type="email" className={inputClass} placeholder="name@email.com" />
            </Field>
            <Field label="Phone">
              <input name="new_phone" className={inputClass} placeholder="(508) 555-0123" />
            </Field>
          </div>
        )}
      </div>

      <div className="grid gap-3 border-t border-black/[0.06] pt-4 sm:grid-cols-2">
        <Field label="Lease start">
          <input name="rental_start" type="date" defaultValue={lease.rentalStart ?? ""} className={inputClass} />
        </Field>
        <Field label="Lease end">
          <input name="rental_end" type="date" defaultValue={lease.rentalEnd ?? ""} className={inputClass} />
        </Field>
        <Field label="Monthly rent">
          <input
            name="rent_price"
            type="number"
            step="0.01"
            defaultValue={lease.rentPrice ?? ""}
            className={inputClass}
            placeholder="0.00"
          />
        </Field>
        <Field label="Rent due day">
          <input
            name="rent_due_day"
            type="number"
            min={1}
            max={31}
            defaultValue={lease.rentDueDay ?? 1}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="space-y-2.5 border-t border-black/[0.06] pt-4">
        <label className="flex items-center gap-2.5 text-sm text-ink/80">
          <input type="checkbox" name="generate_payments" value="1" defaultChecked className="h-4 w-4 rounded border-black/20" />
          Generate this tenant&apos;s monthly payments now
        </label>
        {currentTenant && (
          <label className="flex items-center gap-2.5 text-sm text-ink/80">
            <input type="checkbox" name="archive_old" value="1" className="h-4 w-4 rounded border-black/20" />
            Archive the previous tenant ({currentTenant.name})
          </label>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Check className="h-4 w-4" /> Save tenancy
            </>
          )}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
