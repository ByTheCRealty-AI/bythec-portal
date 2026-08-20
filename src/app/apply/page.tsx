// =============================================================================
// /apply — página PÚBLICA (sem login) da aplicação de aluguel.
// =============================================================================
// Server component: carrega SÓ as propriedades marcadas accepting_applications
// (via service-role, campos mínimos — nada do resto do portfólio vaza) e passa
// pro formulário client. Se o Stripe ainda não estiver configurado, mostra um
// aviso amigável em vez de quebrar (deploy pré-secrets não derruba a rota).
// =============================================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { stripeConfigured } from "@/lib/stripe";
import type { PropertyOption } from "./types";
import ApplyForm from "./ApplyForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Rental Application · By the C Realty",
  description: "Apply for a year-round or off-season rental with By the C Realty & Property Management, Cape Cod MA.",
};

async function loadProperties(): Promise<PropertyOption[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("properties")
      .select("id, address, address2, accepts_year_round, accepts_winter")
      .eq("accepting_applications", true)
      .is("archived_at", null)
      .order("address", { ascending: true });
    if (error || !data) return [];
    return data.map((p) => ({
      id: p.id as string,
      label: [p.address, p.address2].filter(Boolean).join(" · "),
      accepts_year_round: Boolean(p.accepts_year_round),
      accepts_winter: Boolean(p.accepts_winter),
    }));
  } catch {
    // Sem env do admin (preview) — devolve lista vazia; o form usa texto livre.
    return [];
  }
}

export default async function ApplyPage() {
  const [properties, ready] = await Promise.all([
    loadProperties(),
    Promise.resolve(stripeConfigured()),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Marca */}
      <header className="mb-8 flex flex-col items-center text-center">
        {/* logo.png existe no /public do portal */}
        <img src="/logo.png" alt="By the C Realty" className="mb-4 h-14 w-14 object-contain" />
        <h1 className="h-display text-2xl text-ink sm:text-3xl">By the C Realty</h1>
        <p className="mt-1 text-sm font-medium text-ink/70">and Property Management</p>
      </header>

      {!ready ? (
        <div className="glass p-7 text-center">
          <h2 className="h-display text-lg text-ink">Applications open soon</h2>
          <p className="mt-2 text-sm text-ink/60">
            Our online application isn&apos;t available just yet. Please call (508) 364-8556 or
            email info@bythecrealty.com and we&apos;ll help you apply.
          </p>
        </div>
      ) : (
        <ApplyForm properties={properties} />
      )}

      <p className="mt-8 text-center text-xs text-ink/40">
        Anchoring your future on Cape Cod · MA
      </p>
    </main>
  );
}
