import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Badge, Card, buttonClass } from "@/components/ui";
import { PropriedadeArchiveButton } from "../PropriedadeArchiveButton";
import { PROPERTY_TYPE_LABEL, type Property } from "@/lib/types";
import { money, date } from "@/lib/format";
import { Pencil, User } from "lucide-react";

export const dynamic = "force-dynamic";

type PropertyRow = Property & { owner: { id: string; name: string; email: string | null } | null };

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

  return (
    <>
      <PageHeader
        title={p.address}
        subtitle={p.address2 ?? PROPERTY_TYPE_LABEL[p.property_type]}
        action={
          <div className="flex items-center gap-3">
            {archived && <Badge tone="muted">Arquivada</Badge>}
            <Link href={`/propriedades/${p.id}/editar`} className={buttonClass("ghost")}>
              <Pencil className="h-4 w-4" /> Editar
            </Link>
            <PropriedadeArchiveButton id={p.id} archived={archived} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="h-display text-sm text-ink/70">Dados</h3>
            <Badge tone="orange">{PROPERTY_TYPE_LABEL[p.property_type]}</Badge>
          </div>
          <Row label="Endereço" value={p.address} />
          <Row label="Unidade / apto" value={p.address2} />
          <Row label="Comissão" value={p.commission_fee} />
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
            <p className="text-sm text-ink/50">Sem owner.</p>
          )}
        </Card>

        {isRental && (
          <Card className="md:col-span-2">
            <h3 className="h-display mb-3 text-sm text-ink/70">Aluguel</h3>
            <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-4">
              <Row label="Mensal" value={money(p.rent_price)} />
              <Row label="Vencimento" value={p.rent_due_day ? `Dia ${p.rent_due_day}` : null} />
              <Row label="Início" value={date(p.rental_start)} />
              <Row label="Fim" value={date(p.rental_end)} />
            </div>
          </Card>
        )}

        {p.notes && (
          <Card className="md:col-span-2">
            <h3 className="h-display mb-2 text-sm text-ink/70">Notas</h3>
            <p className="whitespace-pre-wrap text-sm text-ink/80">{p.notes}</p>
          </Card>
        )}
      </div>
    </>
  );
}
