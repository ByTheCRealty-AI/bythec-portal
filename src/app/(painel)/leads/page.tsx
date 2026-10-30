// =============================================================================
// /leads — caixa de entrada dos leads vindos do site público (website_leads).
// =============================================================================
// Gated por operations.edit (owner + manager + secretary). Mais novos primeiro.
// Leads NÃO tratados aparecem em cima; tratados ficam numa seção esmaecida.
// Depende da migration 0033 (tabela website_leads). Sem ela, mostra vazio.
// =============================================================================

import { createClient } from "@/lib/supabase/server";
import { PageHeader, NoAccess, EmptyState, Badge, type BadgeTone } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import { Inbox, Mail, Phone, MapPin, Home, ExternalLink } from "lucide-react";
import { setLeadHandledAction } from "./actions";

export const dynamic = "force-dynamic";

type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  property_address: string | null;
  service: string | null;
  kind: string | null;
  source: string | null;
  listing_slug: string | null;
  handled: boolean;
  created_at: string;
};

const SERVICE_TONE: Record<string, BadgeTone> = {
  "Buying a home": "gold",
  "Selling a home": "orange",
  "Year-round rental": "blue",
  "Vacation / seasonal rental": "violet",
  "Property management": "tangerine",
};

async function load(): Promise<{ ok: boolean; leads: Lead[] }> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("website_leads")
      .select(
        "id, name, email, phone, message, property_address, service, kind, source, listing_slug, handled, created_at"
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { ok: true, leads: (data ?? []) as Lead[] };
  } catch {
    return { ok: false, leads: [] };
  }
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <div
      className={
        "rounded-2xl border p-5 transition " +
        (lead.handled
          ? "border-black/[0.06] bg-black/[0.015] opacity-70"
          : "border-black/[0.08] bg-white shadow-[0_1px_2px_rgba(15,27,25,0.04),0_10px_30px_-18px_rgba(15,27,25,0.18)]")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{lead.name}</p>
            {lead.service && <Badge tone={SERVICE_TONE[lead.service] ?? "neutral"}>{lead.service}</Badge>}
            {lead.handled && <Badge tone="muted">Handled</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-ink/45">{fmtWhen(lead.created_at)}</p>
        </div>

        <form action={setLeadHandledAction}>
          <input type="hidden" name="id" value={lead.id} />
          <input type="hidden" name="handled" value={lead.handled ? "false" : "true"} />
          <button
            type="submit"
            className={
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
              (lead.handled
                ? "border border-black/[0.10] bg-white text-ink/65 hover:border-black/20 hover:text-ink"
                : "bg-gradient-to-r from-primary to-secondary text-white shadow-[0_8px_24px_-8px_rgba(25,133,119,0.55)] hover:scale-[1.02]")
            }
          >
            {lead.handled ? "Reopen" : "Mark handled"}
          </button>
        </form>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
          <Mail className="h-3.5 w-3.5" /> {lead.email}
        </a>
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
            <Phone className="h-3.5 w-3.5" /> {lead.phone}
          </a>
        )}
        {lead.property_address && (
          <span className="inline-flex items-center gap-1.5 text-ink/60">
            <MapPin className="h-3.5 w-3.5" /> {lead.property_address}
          </span>
        )}
      </div>

      {lead.message && (
        <p className="mt-3 whitespace-pre-line rounded-xl bg-black/[0.02] p-3 text-[13px] leading-relaxed text-ink/75">
          {lead.message}
        </p>
      )}

      {(lead.listing_slug || lead.source) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink/45">
          {lead.listing_slug && (
            <a
              href={`https://bythecrealty.com/listings/${lead.listing_slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-primary"
            >
              <Home className="h-3 w-3" /> {lead.listing_slug} <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          {lead.source && <span>from: {lead.source}</span>}
        </div>
      )}
    </div>
  );
}

export default async function LeadsPage() {
  const profile = await getProfile();
  if (!can(profile, "operations.edit")) {
    return (
      <>
        <PageHeader title="Leads" />
        <NoAccess />
      </>
    );
  }

  const { leads } = await load();
  const open = leads.filter((l) => !l.handled);
  const handled = leads.filter((l) => l.handled);

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Contact and inquiry messages from the website, tagged by service. Newest first."
      />

      {leads.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title="No leads yet"
          message="When someone fills out a contact or inquiry form on the website, it will show up here — tagged with the service they want."
        />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              New {open.length > 0 && `(${open.length})`}
            </h2>
            {open.length > 0 ? (
              <div className="space-y-4">
                {open.map((l) => (
                  <LeadCard key={l.id} lead={l} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-black/[0.08] bg-black/[0.015] p-6 text-center text-sm text-ink/50">
                You're all caught up — no new leads.
              </p>
            )}
          </section>

          {handled.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-ink/40">
                Handled ({handled.length})
              </h2>
              <div className="space-y-4">
                {handled.map((l) => (
                  <LeadCard key={l.id} lead={l} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
