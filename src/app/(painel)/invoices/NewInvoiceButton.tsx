"use client";

// Botão "New invoice" com escolha de tipo. Service-only users (secretary) NÃO
// veem a opção Seasonal (canSeasonal=false) → vão direto pro service.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui";
import { Plus, Sun, Wrench, X } from "lucide-react";

export function NewInvoiceButton({ canSeasonal }: { canSeasonal: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Sem acesso a seasonal: o botão leva direto pro service invoice.
  if (!canSeasonal) {
    return (
      <button onClick={() => router.push("/invoices/novo/servico")} className={buttonClass("primary")}>
        <Plus className="h-4 w-4" /> New service invoice
      </button>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClass("primary")}>
        <Plus className="h-4 w-4" /> New invoice
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-black/[0.07] bg-white p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="h-display text-lg text-ink">Choose invoice type</h2>
              <button onClick={() => setOpen(false)} className="text-ink/40 hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => router.push("/invoices/novo/temporada")}
                className="flex items-start gap-3 rounded-xl border border-black/[0.08] bg-white p-4 text-left transition hover:border-primary/40 hover:bg-primary/[0.03]"
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary/10 text-secondary">
                  <Sun className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-ink">Seasonal</span>
                  <span className="block text-xs text-ink/55">
                    Airbnb / VRBO reservation. Locked owner-payout formula.
                  </span>
                </span>
              </button>
              <button
                onClick={() => router.push("/invoices/novo/servico")}
                className="flex items-start gap-3 rounded-xl border border-black/[0.08] bg-white p-4 text-left transition hover:border-primary/40 hover:bg-primary/[0.03]"
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Wrench className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-ink">Service</span>
                  <span className="block text-xs text-ink/55">
                    Maintenance / long-term work. Labor + material line items.
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
