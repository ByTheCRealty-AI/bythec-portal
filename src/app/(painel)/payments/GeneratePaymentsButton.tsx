"use client";

// Botão "Generate monthly payments" na aba Payments da propriedade. Lê as datas
// do contrato (start/end) e cria um pagamento 'monthly' por mês. Mostra uma
// PRÉVIA (quantos vai criar, quantos já existem) antes de confirmar — o servidor
// recomputa e pula os meses que já têm pagamento (idempotente). A prévia aqui é
// só informativa; a fonte da verdade é a server action.
import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { CalendarPlus, Check, Loader2 } from "lucide-react";
import { generateMonthlyPaymentsAction } from "./actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Lista de meses YYYY-MM-01 de start..end inclusive (aritmética pura, sem fuso).
function monthsBetween(start: string, end: string): string[] {
  const [sy, sm] = start.slice(0, 10).split("-").map(Number);
  const [ey, em] = end.slice(0, 10).split("-").map(Number);
  const count = (ey - sy) * 12 + (em - sm) + 1;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const m0 = sm - 1 + i;
    const y = sy + Math.floor(m0 / 12);
    const mm = ((m0 % 12) + 12) % 12 + 1;
    out.push(`${String(y).padStart(4, "0")}-${String(mm).padStart(2, "0")}-01`);
  }
  return out;
}

function monthLabel(ym01: string): string {
  const [y, m] = ym01.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function money(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function GeneratePaymentsButton({
  propertyId,
  rentPrice,
  rentalStart,
  rentalEnd,
  rentDueDay,
  existingMonths,
}: {
  propertyId: string;
  rentPrice: number | null;
  rentalStart: string | null;
  rentalEnd: string | null;
  rentDueDay: number | null;
  existingMonths: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const rent = rentPrice != null ? Number(rentPrice) : NaN;
  const hasLease = Boolean(rentalStart && rentalEnd) && Number.isFinite(rent) && rent > 0;

  if (!hasLease) {
    return (
      <button
        type="button"
        disabled
        className={buttonClass("ghost")}
        title="Set the lease start date, end date and monthly rent on this property first."
      >
        <CalendarPlus className="h-4 w-4" /> Generate monthly payments
      </button>
    );
  }

  const all = monthsBetween(rentalStart as string, rentalEnd as string);
  const taken = new Set(existingMonths.map((m) => `${m.slice(0, 7)}-01`));
  const toCreate = all.filter((m) => !taken.has(m));
  const skipped = all.length - toCreate.length;
  const dueDay = rentDueDay ?? 1;
  const commission = Math.round(rent * 0.1 * 100) / 100;
  const preview = toCreate.slice(0, 5);

  function confirm() {
    setResult(null);
    start(async () => {
      const r = await generateMonthlyPaymentsAction(propertyId);
      setResult(
        `Created ${r.created} payment${r.created === 1 ? "" : "s"}` +
          (r.skipped ? `, skipped ${r.skipped} already there.` : ".")
      );
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setOpen(true);
          }}
          className={buttonClass("ghost")}
        >
          <CalendarPlus className="h-4 w-4" /> Generate monthly payments
        </button>
        {result && <p className="text-sm font-medium text-primary">{result}</p>}
      </div>
    );
  }

  return (
    <div className="glass space-y-5 p-6">
      <div>
        <h3 className="h-display text-base text-ink">
          {toCreate.length > 0
            ? `Generate ${toCreate.length} monthly payment${toCreate.length === 1 ? "" : "s"}`
            : "Nothing to generate"}
        </h3>
        <p className="mt-0.5 text-xs text-ink/55">
          From the lease · {monthLabel(all[0])} – {monthLabel(all[all.length - 1])}
        </p>
      </div>

      {toCreate.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-black/[0.03] px-3.5 py-2.5">
              <p className="text-xs text-ink/45">Amount each</p>
              <p className="text-lg font-semibold text-ink">{money(rent)}</p>
            </div>
            <div className="rounded-xl bg-black/[0.03] px-3.5 py-2.5">
              <p className="text-xs text-ink/45">Due day</p>
              <p className="text-lg font-semibold text-ink">Day {dueDay}</p>
            </div>
            <div className="rounded-xl bg-black/[0.03] px-3.5 py-2.5">
              <p className="text-xs text-ink/45">Commission (10%)</p>
              <p className="text-lg font-semibold text-ink">{money(commission)}/mo</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {preview.map((m) => (
              <span
                key={m}
                className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs text-ink/65"
              >
                {monthLabel(m)}
              </span>
            ))}
            {toCreate.length > preview.length && (
              <span className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs text-ink/65">
                … {monthLabel(toCreate[toCreate.length - 1])}
              </span>
            )}
          </div>

          <p className="rounded-xl border border-primary/20 bg-primary/[0.06] px-3.5 py-2.5 text-xs text-ink/70">
            All created as “Due.”{" "}
            {skipped > 0
              ? `${skipped} month${skipped === 1 ? "" : "s"} already have a payment and will be skipped.`
              : "Months that already have a payment are skipped, so this won’t duplicate."}
          </p>
        </>
      ) : (
        <p className="rounded-xl border border-black/10 bg-black/[0.02] px-3.5 py-2.5 text-sm text-ink/65">
          Every month in the lease term already has a payment. Nothing to create.
        </p>
      )}

      <div className="flex gap-3">
        {toCreate.length > 0 && (
          <button type="button" onClick={confirm} disabled={pending} className={buttonClass("primary")}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" /> Create {toCreate.length} payment{toCreate.length === 1 ? "" : "s"}
              </>
            )}
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </div>
  );
}
