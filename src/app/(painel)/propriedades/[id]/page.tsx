import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Badge, Card, buttonClass } from "@/components/ui";
import { PropriedadeArchiveButton } from "../PropriedadeArchiveButton";
import {
  PROPERTY_TYPE_LABEL,
  type Property,
  type Note,
  type Service,
  type TenantRequest,
} from "@/lib/types";
import { money, date } from "@/lib/format";
import { Pencil, User, StickyNote, Wrench, HardHat } from "lucide-react";

export const dynamic = "force-dynamic";

type PropertyRow = Property & { owner: { id: string; name: string; email: string | null } | null };

function StatusBadge({ status }: { status: "open" | "done" }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
        Done
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-secondary/25 bg-secondary/10 px-2.5 py-0.5 text-xs font-semibold text-secondary">
      Open
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-black/[0.06] py-2.5 last:border-0">
      <span className="text-xs uppercase tracking-wider text-ink/45">{label}</span>
      <span className="text-sm text-ink/90">{value || "—"}</span>
    </div>
  );
}

export default async function PropriedadeDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("properties")
    .select("*, owner:owner_id (id, name, email)")
    .eq("id", params.id)
    .single();
  if (error || !data) notFound();
  const p = data as unknown as PropertyRow;
  const archived = p.archived_at !== null;
  const isRental = p.property_type === "year_round_rental" || p.property_type === "off_season_rental";

  // Notes (polymorphic), services and tenant requests for this property.
  const [{ data: notesData }, { data: servicesData }, { data: requestsData }] = await Promise.all([
    supabase
      .from("notes")
      .select("id, body, year, created_at, updated_at, parent_type, parent_id")
      .eq("parent_type", "property")
      .eq("parent_id", p.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("services")
      .select(
        "id, service_request_date, description, status, price, created_at, provider:provider_id(id,name)"
      )
      .eq("property_id", p.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tenant_requests")
      .select("id, date, description, status, created_at")
      .eq("property_id", p.id)
      .order("created_at", { ascending: false }),
  ]);

  const notes = (notesData ?? []) as Note[];
  const services = (servicesData ?? []) as unknown as Service[];
  const requests = (requestsData ?? []) as unknown as TenantRequest[];

  return (
    <>
      <PageHeader
        title={p.address}
        subtitle={p.address2 ?? PROPERTY_TYPE_LABEL[p.property_type]}
        action={
          <div className="flex items-center gap-3">
            {archived && <Badge tone="muted">Archived</Badge>}
            <Link href={`/propriedades/${p.id}/editar`} className={buttonClass("ghost")}>
              <Pencil className="h-4 w-4" /> Edit
            </Link>
            <PropriedadeArchiveButton id={p.id} archived={archived} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="h-display text-sm text-ink/70">Details</h3>
            <Badge tone="orange">{PROPERTY_TYPE_LABEL[p.property_type]}</Badge>
          </div>
          <Row label="Address" value={p.address} />
          <Row label="Unit / apt" value={p.address2} />
          <Row label="Commission" value={p.commission_fee} />
        </Card>

        <Card>
          <h3 className="h-display mb-3 text-sm text-ink/70">Owner</h3>
          {p.owner ? (
            <Link
              href={`/clientes/${p.owner.id}`}
              className="flex items-center gap-3 rounded-xl border border-black/[0.10] bg-black/[0.015] p-3 transition hover:border-primary/40 hover:bg-primary/[0.04]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <User className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{p.owner.name}</span>
                <span className="block text-xs text-ink/50">{p.owner.email ?? "—"}</span>
              </span>
            </Link>
          ) : (
            <p className="text-sm text-ink/50">No owner.</p>
          )}
        </Card>

        {isRental && (
          <Card className="md:col-span-2">
            <h3 className="h-display mb-3 text-sm text-ink/70">Rent</h3>
            <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-4">
              <Row label="Monthly" value={money(p.rent_price)} />
              <Row label="Due" value={p.rent_due_day ? `Day ${p.rent_due_day}` : null} />
              <Row label="Start" value={date(p.rental_start)} />
              <Row label="End" value={date(p.rental_end)} />
            </div>
          </Card>
        )}

        {p.notes && (
          <Card className="md:col-span-2">
            <h3 className="h-display mb-2 text-sm text-ink/70">Notes</h3>
            <p className="whitespace-pre-wrap text-sm text-ink/80">{p.notes}</p>
          </Card>
        )}

        {/* Tenant requests for this property (mini-list) */}
        <Card className="md:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            <h3 className="h-display text-sm text-ink/70">Tenant requests ({requests.length})</h3>
          </div>
          {requests.length === 0 ? (
            <p className="text-sm text-ink/45">No tenant requests for this property.</p>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {requests.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-ink/85">{r.description || "—"}</p>
                    <p className="mt-0.5 text-xs text-ink/45">{date(r.date ?? r.created_at)}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Services history */}
        <Card className="md:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <HardHat className="h-4 w-4 text-primary" />
            <h3 className="h-display text-sm text-ink/70">Services ({services.length})</h3>
          </div>
          {services.length === 0 ? (
            <p className="text-sm text-ink/45">No services recorded for this property.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-black/[0.08]">
              <table className="w-full text-left text-sm">
                <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
                  <tr>
                    <th className="px-4 py-2.5 font-bold">Date</th>
                    <th className="px-4 py-2.5 font-bold">Description</th>
                    <th className="px-4 py-2.5 font-bold">Provider</th>
                    <th className="px-4 py-2.5 font-bold text-right">Price</th>
                    <th className="px-4 py-2.5 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s, i) => (
                    <tr
                      key={s.id}
                      className={"border-t border-black/[0.05] " + (i % 2 === 1 ? "bg-black/[0.015]" : "")}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink/65">
                        {date(s.service_request_date ?? s.created_at)}
                      </td>
                      <td className="px-4 py-2.5 text-ink/85">{s.description || "—"}</td>
                      <td className="px-4 py-2.5 text-ink/65">{s.provider?.name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right text-ink/85">{money(s.price)}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={s.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Notes timeline (polymorphic) */}
        <Card className="md:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" />
            <h3 className="h-display text-sm text-ink/70">Notes timeline ({notes.length})</h3>
          </div>
          {notes.length === 0 ? (
            <p className="text-sm text-ink/45">No notes for this property yet.</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-xl border border-black/[0.07] bg-black/[0.015] p-3.5"
                >
                  <div className="mb-1 flex items-center gap-2 text-xs text-ink/45">
                    <span>{date(n.created_at)}</span>
                    {n.year && <span className="text-ink/35">· {n.year}</span>}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-ink/80">{n.body || "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
