// =============================================================================
// SalesCommissionsSection — comissões de venda (brokerage) na tela Finances.
// SÓ LEITURA. O valor vem da propriedade (properties.sale_commission, 0027),
// preenchida uma vez na aba Sales junto com o preço e a %. Casa vendida =
// comissão ganha; não existe etapa de "owed" nem botão de marcar recebido —
// a comissão de venda sai na mesa do fechamento.
// Antes, o valor era digitado de novo no deal do cliente e nada se conversava:
// $10.250 na propriedade e $0,00 aqui.
// =============================================================================
import Link from "next/link";
import { money, date } from "@/lib/format";

export type SoldListing = {
  id: string;
  address: string;
  address2: string | null;
  sale_price: number | null;
  sale_commission: number | null;
  sale_commission_rate: number | null;
  sale_status: string | null;
  sold_at: string | null;
  owner: { id: string; name: string } | null;
};

export function SalesCommissionsSection({ listings }: { listings: SoldListing[] }) {
  if (listings.length === 0) {
    return (
      <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-6 text-center text-sm text-ink/50 shadow-card">
        No sold listings yet. In{" "}
        <Link href="/sales" className="font-semibold text-primary hover:underline">
          Sales
        </Link>
        , set a property&rsquo;s status to Sold (or fill its closing date) and its commission shows
        up here on its own.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
          <tr>
            <th className="px-4 py-3 font-bold">Property</th>
            <th className="px-4 py-3 font-bold">Seller</th>
            <th className="px-4 py-3 font-bold">Closed</th>
            <th className="px-4 py-3 font-bold">Sale price</th>
            <th className="px-4 py-3 font-bold">Commission</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l, i) => (
            <ListingRow key={l.id} listing={l} zebra={i % 2 === 1} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListingRow({ listing, zebra }: { listing: SoldListing; zebra: boolean }) {
  // Sem comissão na propriedade não há o que mostrar — a Andrea preenche em Sales.
  const missing = listing.sale_commission == null || listing.sale_commission <= 0;

  return (
    <tr className={zebra ? "bg-black/[0.012]" : ""}>
      <td className="px-4 py-3">
        <Link
          href={`/propriedades/${listing.id}`}
          className="font-medium text-ink hover:text-primary"
        >
          {listing.address}
        </Link>
        {listing.address2 && <span className="block text-xs text-ink/45">{listing.address2}</span>}
      </td>
      <td className="px-4 py-3 text-ink/65">
        {listing.owner ? (
          <Link href={`/clientes/${listing.owner.id}`} className="hover:text-primary">
            {listing.owner.name}
          </Link>
        ) : (
          "—"
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink/60">{date(listing.sold_at)}</td>
      <td className="whitespace-nowrap px-4 py-3 text-ink/65">
        {listing.sale_price != null ? money(listing.sale_price) : "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        {missing ? (
          <Link href="/sales" className="text-xs font-semibold text-amber-700 hover:underline">
            Set it in Sales →
          </Link>
        ) : (
          <span className="font-semibold text-ink">
            {money(listing.sale_commission)}
            {listing.sale_commission_rate != null && (
              <span className="ml-1 text-xs font-normal text-ink/40">
                · {listing.sale_commission_rate}%
              </span>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}
