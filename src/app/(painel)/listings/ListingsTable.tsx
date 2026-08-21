"use client";

// =============================================================================
// Listings — o que o site público mostra.
// =============================================================================
// Padrão da casa (igual Providers): linha limpa e clicável → janelinha (modal)
// com detalhe + Edit + Delete; Delete abre um SEGUNDO modal de confirmação.
// Modal SEMPRE via createPortal(document.body) — lesson 2026-08-14: `fixed`
// dentro do AppShell (que tem transform) ancora no ancestral e o card some da
// tela.
//
// Dois interruptores que a Andrea trata como coisas diferentes:
//   On the website (active)  — desligar tira do site na hora, sem deletar nada.
//   Featured                 — sobe pra home do site; só vale se estiver active.
//
// Delete é recuperável pra todo mundo (vai pra aba "Deleted", dá pra restaurar).
// "Delete permanently" só aparece pra owner, e só dentro da aba Deleted.
import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  Search, Plus, Loader2, Check, Pencil, Trash2, X, Star, ExternalLink,
  Home, Eye, EyeOff, RotateCcw, AlertTriangle, Link2, Lock,
} from "lucide-react";
import { Badge, Field, EmptyState, inputClass, selectClass, buttonClass } from "@/components/ui";
import { cx, money } from "@/lib/format";
import { ListingPhotos } from "./ListingPhotos";
import {
  LISTING_STATUS_LABEL,
  LISTING_TYPE_FLAGS,
  LISTING_TYPE_FLAG_LABEL,
  LISTING_TYPE_FLAG_HINT,
  listingTypeFlags,
  type ListingTypeFlag,
  type Listing,
  type ListingPhoto,
  type ListingPropertyOption,
  type PropertyType,
} from "@/lib/types";

type Action = (fd: FormData) => void | Promise<void>;
export type ClientOption = { id: string; name: string };

// Rótulo curto do preço, por categoria. Temporada varia (noite/semana), então
// nunca inventamos a unidade — o anúncio externo é quem manda.
function priceLabel(l: Listing): string {
  if (l.price == null) return "—";
  const p = money(l.price);
  if (l.is_year_round) return `${p}/mo`;
  return p;
}

function specLine(l: Listing): string {
  const bits: string[] = [];
  if (l.bedrooms != null) bits.push(`${l.bedrooms} bd`);
  if (l.bathrooms != null) {
    const half = l.half_baths ? `.${l.half_baths}` : "";
    bits.push(`${l.bathrooms}${half} ba`);
  }
  if (l.sqft != null) bits.push(`${l.sqft.toLocaleString("en-US")} sqft`);
  if (l.guests != null) bits.push(`sleeps ${l.guests}`);
  return bits.join(" · ");
}

// Link externo do anúncio. Airbnb pra temporada, CCIAOR/MLS pra venda e
// long-term. Se a listing tiver os dois, mostramos os dois.
function externalLinks(l: Listing): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  if (l.airbnb_link) out.push({ label: "Airbnb", href: l.airbnb_link });
  if (l.mls_link) out.push({ label: "CCIAOR / MLS", href: l.mls_link });
  return out;
}

function Modal({ onClose, children, z = 50, wide }: { onClose: () => void; children: React.ReactNode; z?: number; wide?: boolean }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: z }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        className={cx(
          "relative max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-black/[0.08] bg-white shadow-2xl",
          wide ? "max-w-2xl" : "max-w-md"
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

function DetailRow({ label, value, accent }: { label: React.ReactNode; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-black/[0.06] py-2.5 text-sm">
      <span className="text-ink/45">{label}</span>
      <span className={"text-right " + (accent ? "text-primary" : "text-ink/85")}>{value || "—"}</span>
    </div>
  );
}

// ---- Form ------------------------------------------------------------------

function ListingFields({
  l, clients, properties,
}: {
  l?: Listing;
  clients: ClientOption[];
  properties: ListingPropertyOption[];
}) {
  // Os 4 tipos são INDEPENDENTES (migration 0040): "some homes are vacation and
  // winter, some winter only, some vacation only". Marcar quantos valerem.
  const [types, setTypes] = useState<Record<ListingTypeFlag, boolean>>({
    is_for_sale: l?.is_for_sale ?? false,
    is_year_round: l?.is_year_round ?? false,
    is_vacation: l?.is_vacation ?? false,
    is_winter: l?.is_winter ?? false,
  });
  const anyType = LISTING_TYPE_FLAGS.some((f) => types[f]);

  // Campos que o picker de property PREENCHE. Ficam controlados pra o autofill
  // conseguir escrever neles; o usuário edita por cima livremente depois (o
  // endereço é COPIADO, não amarrado — a listing é peça de marketing).
  const [propertyId, setPropertyId] = useState<string>(l?.property_id ?? "");
  const [address, setAddress] = useState<string>(l?.address ?? "");
  const [address2, setAddress2] = useState<string>(l?.address2 ?? "");
  const [clientId, setClientId] = useState<string>(l?.client_id ?? "");
  const [price, setPrice] = useState<string>(l?.price != null ? String(l.price) : "");

  // Escolher uma property puxa o que ela já sabe. Só preenche campo VAZIO,
  // exceto endereço/dono, que são o motivo de existir do picker. Assim ninguém
  // perde um preço ou uma foto que já tinha digitado à mão.
  function pickProperty(id: string) {
    setPropertyId(id);
    if (!id) return;
    const p = properties.find((x) => x.id === id);
    if (!p) return;
    setAddress(p.address ?? "");
    setAddress2(p.address2 ?? "");
    if (p.owner_id) setClientId(p.owner_id);
    // A property já sabe o tipo dela; liga a flag equivalente se nada foi marcado.
    if (p.property_type && !LISTING_TYPE_FLAGS.some((f) => types[f])) {
      const map: Record<PropertyType, ListingTypeFlag> = {
        for_sale: "is_for_sale",
        year_round_rental: "is_year_round",
        vacation_rental: "is_vacation",
        off_season_rental: "is_winter",
      };
      const flag = map[p.property_type];
      if (flag) setTypes((t) => ({ ...t, [flag]: true }));
    }
    if (p.rent_price != null && !price) setPrice(String(p.rent_price));
  }

  const picked = properties.find((x) => x.id === propertyId);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* ---- Puxar de uma property já cadastrada ---- */}
      <div className="sm:col-span-2 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <Link2 className="h-3.5 w-3.5" /> Use a property you already manage
        </p>
        <p className="mb-3 text-xs text-ink/55">
          Pick the house and the address fills in for you, along with the owner, the type and
          the rent when we have them. Everything stays editable afterwards.
        </p>
        <select
          name="property_id"
          value={propertyId}
          onChange={(e) => pickProperty(e.target.value)}
          className={selectClass}
        >
          <option value="">Not linked — I&rsquo;ll type the address myself</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.address}{p.address2 ? ` · ${p.address2}` : ""}
            </option>
          ))}
        </select>
        {picked && (
          <p className="mt-2 text-xs text-primary">
            Pulled from {picked.address}. Edits below only change the listing, never the property.
          </p>
        )}
      </div>

      <div className="sm:col-span-2">
        <Field label="Property address *" hint="Street, town, state — this is the title shown on the website.">
          <input
            name="address"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputClass}
            placeholder="123 Main St, Falmouth, MA 02540"
          />
        </Field>
      </div>

      <Field label="Unit / apt">
        <input
          name="address2"
          value={address2}
          onChange={(e) => setAddress2(e.target.value)}
          className={inputClass}
          placeholder="Apt 2B"
        />
      </Field>

      <Field label="Owner (client)">
        <select name="client_id" value={clientId} onChange={(e) => setClientId(e.target.value)} className={selectClass}>
          <option value="">Not linked</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <span className="mt-1 flex items-center gap-1 text-xs text-ink/45">
          <Lock className="h-3 w-3" /> Internal only — the owner is never shown on the website.
        </span>
      </Field>

      {/* Tipos: independentes. Uma casa pode ser vacation E winter. */}
      <div className="sm:col-span-2 rounded-xl border border-black/[0.08] bg-black/[0.015] p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">
          What is this listing for? *
        </p>
        <p className="mt-0.5 mb-3 text-xs text-ink/45">
          Tick everything that applies — a house can be a vacation rental and a winter rental at
          the same time.
        </p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {LISTING_TYPE_FLAGS.map((f) => (
            <label key={f} className="flex items-start gap-2.5 text-sm text-ink/80">
              <input
                type="checkbox"
                name={f}
                value="1"
                checked={types[f]}
                onChange={(e) => setTypes((t) => ({ ...t, [f]: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-black/20"
              />
              <span>
                <span className="font-semibold text-ink">{LISTING_TYPE_FLAG_LABEL[f]}</span>
                <span className="block text-xs text-ink/50">{LISTING_TYPE_FLAG_HINT[f]}</span>
              </span>
            </label>
          ))}
        </div>
        {!anyType && (
          <p className="mt-3 text-xs font-semibold text-red-600">Pick at least one.</p>
        )}
      </div>

      <Field label="Status">
        <select name="listing_status" defaultValue={l?.listing_status ?? "active"} className={selectClass}>
          {Object.entries(LISTING_STATUS_LABEL).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </Field>

      <Field label="Price" hint={types.is_year_round ? "Monthly rent." : "Sale price, or nightly/weekly rate."}>
        <input name="price" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} placeholder="$2,400" />
      </Field>

      <Field label="Available from">
        <input name="available_date" type="date" defaultValue={l?.available_date ?? ""} className={inputClass} />
      </Field>

      {/* ---- Links externos (o pedido da Andrea) ---- */}
      <div className="sm:col-span-2 mt-1 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
          Link to the live listing
        </p>
        <p className="mb-3 text-xs text-ink/55">
          Paste the Airbnb or CCIAOR/MLS address. It becomes a clickable button here and on the
          website, so people can open the real listing. You can fill in one or both.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Airbnb link">
            <input name="airbnb_link" defaultValue={l?.airbnb_link ?? ""} className={inputClass} placeholder="airbnb.com/rooms/12345678" />
          </Field>
          <Field label="CCIAOR / MLS link">
            <input name="mls_link" defaultValue={l?.mls_link ?? ""} className={inputClass} placeholder="cciaor.com/listing/22401234" />
          </Field>
        </div>
      </div>

      {/* ---- Specs ---- */}
      <Field label="Bedrooms">
        <input name="bedrooms" inputMode="numeric" defaultValue={l?.bedrooms != null ? String(l.bedrooms) : ""} className={inputClass} placeholder="3" />
      </Field>
      <Field label="Full baths">
        <input name="bathrooms" inputMode="numeric" defaultValue={l?.bathrooms != null ? String(l.bathrooms) : ""} className={inputClass} placeholder="2" />
      </Field>
      <Field label="Half baths">
        <input name="half_baths" inputMode="numeric" defaultValue={l?.half_baths != null ? String(l.half_baths) : ""} className={inputClass} placeholder="1" />
      </Field>
      <Field label="Garage spaces">
        <input name="garage" inputMode="numeric" defaultValue={l?.garage != null ? String(l.garage) : ""} className={inputClass} placeholder="1" />
      </Field>
      <Field label="Square feet">
        <input name="sqft" inputMode="numeric" defaultValue={l?.sqft != null ? String(l.sqft) : ""} className={inputClass} placeholder="1,850" />
      </Field>
      <Field label="Sleeps" hint="Vacation rentals — max guests.">
        <input name="guests" inputMode="numeric" defaultValue={l?.guests != null ? String(l.guests) : ""} className={inputClass} placeholder="6" />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Description" hint="Shown on the website listing page.">
          <textarea name="description" rows={4} defaultValue={l?.description ?? ""} className={inputClass} />
        </Field>
      </div>

      {/* ---- Interruptores do site ---- */}
      <div className="sm:col-span-2 space-y-3 rounded-xl border border-black/[0.08] bg-black/[0.015] p-4">
        <label className="flex items-start gap-2.5 text-sm text-ink/80">
          <input type="checkbox" name="active" value="1" defaultChecked={l?.active ?? true} className="mt-0.5 h-4 w-4 rounded border-black/20" />
          <span>
            <span className="font-semibold text-ink">Show on the website</span>
            <span className="block text-xs text-ink/50">Uncheck to pull it from the public site. Nothing is deleted.</span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 text-sm text-ink/80">
          <input type="checkbox" name="featured" value="1" defaultChecked={l?.featured ?? false} className="mt-0.5 h-4 w-4 rounded border-black/20" />
          <span>
            <span className="font-semibold text-ink">Feature on the home page</span>
            <span className="block text-xs text-ink/50">Only applies while the listing is shown on the website.</span>
          </span>
        </label>
      </div>
    </div>
  );
}

function ListingForm({
  l, clients, properties, action, onDone, onCancel, submitLabel,
}: {
  l?: Listing;
  clients: ClientOption[];
  properties: ListingPropertyOption[];
  action: Action;
  onDone: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (l) fd.set("id", l.id);
    if (!((fd.get("address") as string) ?? "").trim()) {
      setError("A property address is required.");
      return;
    }
    // Espelha o assertHasType do servidor — erra perto do campo, não depois do
    // round-trip.
    if (!LISTING_TYPE_FLAGS.some((f) => fd.get(f) === "1")) {
      setError("Pick at least one type for this listing — for sale, year-round, vacation or winter.");
      return;
    }
    start(async () => {
      try {
        await action(fd);
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ListingFields l={l} clients={clients} properties={properties} />
      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
      )}
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {pending ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---- Toggles inline --------------------------------------------------------

// Olho = está no ar no site? Otimista, com rollback se a action falhar.
function ActiveToggle({ l, action, canManage }: { l: Listing; action: Action; canManage: boolean }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useState(l.active);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canManage) return;
    const next = !on;
    setOn(next);
    const fd = new FormData();
    fd.set("id", l.id);
    fd.set("active", next ? "1" : "0");
    start(async () => {
      try { await action(fd); } catch { setOn(!next); }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending || !canManage}
      title={on ? "Live on the website — click to hide" : "Hidden from the website — click to show"}
      aria-label={on ? "Hide from website" : "Show on website"}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition disabled:opacity-60",
        on
          ? "border-primary/25 bg-primary/10 text-primary hover:bg-primary/15"
          : "border-black/10 bg-black/[0.04] text-ink/45 hover:bg-black/[0.07]"
      )}
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : on ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
      {on ? "On website" : "Hidden"}
    </button>
  );
}

// Estrela = featured na home. Desabilitada quando a listing não está no ar,
// porque featured só tem efeito entre as active (o site filtra por active).
function FeaturedToggle({ l, action, canManage, size = "sm" }: { l: Listing; action: Action; canManage: boolean; size?: "sm" | "lg" }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useState(l.featured);
  const cls = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const blocked = !l.active;

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canManage || blocked) return;
    const next = !on;
    setOn(next);
    const fd = new FormData();
    fd.set("id", l.id);
    fd.set("featured", next ? "1" : "0");
    start(async () => {
      try { await action(fd); } catch { setOn(!next); }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending || !canManage || blocked}
      aria-label={on ? "Remove from home page" : "Feature on home page"}
      title={blocked ? "Turn the listing on first to feature it" : on ? "Featured on the home page — click to remove" : "Feature on the home page"}
      className="shrink-0 rounded-md p-0.5 transition hover:bg-black/[0.04] disabled:opacity-40"
    >
      <Star className={cx(cls, on ? "fill-amber-400 text-amber-500" : "text-ink/25 hover:text-ink/45")} />
    </button>
  );
}

// ---- Tabela ----------------------------------------------------------------

export function ListingsTable({
  listings, deleted, clients, properties, photosByListing, canManage, canPurge,
  createAction, updateAction, deleteAction, restoreAction, purgeAction,
  toggleActiveAction, toggleFeaturedAction,
  addPhotoAction, deletePhotoAction, reorderPhotosAction,
}: {
  listings: Listing[];
  deleted: Listing[];
  clients: ClientOption[];
  properties: ListingPropertyOption[];
  photosByListing: Record<string, ListingPhoto[]>;
  canManage: boolean;
  canPurge: boolean;
  createAction: Action;
  updateAction: Action;
  deleteAction: Action;
  restoreAction: Action;
  purgeAction: Action;
  toggleActiveAction: Action;
  toggleFeaturedAction: Action;
  addPhotoAction: Action;
  deletePhotoAction: Action;
  reorderPhotosAction: Action;
}) {
  const [query, setQuery] = useState("");
  // Filtro por FLAG: "Vacation Rental" traz tudo que é vacation, inclusive as
  // que também são winter (antes, com category única, uma vacation+winter só
  // aparecia num dos filtros).
  const [tab, setTab] = useState<"all" | ListingTypeFlag | "hidden" | "deleted">("all");
  const [open, setOpen] = useState<{ listing: Listing | null; editing: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Listing | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<Listing | null>(null);
  const [rowPending, startRow] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  const showingDeleted = tab === "deleted";
  const source = showingDeleted ? deleted : listings;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    let rows = source;
    if (tab === "hidden") rows = rows.filter((l) => !l.active);
    else if (tab !== "all" && tab !== "deleted") rows = rows.filter((l) => l[tab] === true);
    if (!term) return rows;
    return rows.filter((l) => {
      const hay = `${l.address ?? ""} ${l.address2 ?? ""} ${l.description ?? ""}`.toLowerCase();
      return term.split(/\s+/).every((w) => hay.includes(w));
    });
  }, [source, tab, query]);

  const counts = useMemo(
    () => ({
      all: listings.length,
      hidden: listings.filter((l) => !l.active).length,
      deleted: deleted.length,
      ...Object.fromEntries(
        LISTING_TYPE_FLAGS.map((f) => [f, listings.filter((l) => l[f] === true).length])
      ),
    }),
    [listings, deleted]
  ) as Record<string, number>;

  function runRowAction(action: Action, l: Listing, after: () => void) {
    setRowError(null);
    const fd = new FormData();
    fd.set("id", l.id);
    startRow(async () => {
      try {
        await action(fd);
        after();
      } catch (err) {
        setRowError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      }
    });
  }

  const chips: { key: typeof tab; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    ...LISTING_TYPE_FLAGS.map((f) => ({
      key: f,
      label: LISTING_TYPE_FLAG_LABEL[f],
      count: counts[f] ?? 0,
    })),
    { key: "hidden", label: "Hidden", count: counts.hidden },
    { key: "deleted", label: "Deleted", count: counts.deleted },
  ];

  return (
    <>
      {/* Chips de filtro */}
      <div className="mb-4 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setTab(c.key)}
            className={cx(
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
              tab === c.key
                ? "border-primary bg-primary text-white"
                : "border-black/10 bg-white text-ink/60 hover:border-black/20 hover:text-ink"
            )}
          >
            {c.label}
            <span className={cx("ml-1.5", tab === c.key ? "text-white/70" : "text-ink/35")}>{c.count}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search address or listing number…"
            className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
          />
        </div>
        {canManage && !showingDeleted && (
          <button type="button" onClick={() => setOpen({ listing: null, editing: true })} className={buttonClass("primary")}>
            <Plus className="h-4 w-4" /> Add listing
          </button>
        )}
      </div>

      {rowError && (
        <p className="mb-4 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{rowError}</p>
      )}

      {showingDeleted && deleted.length > 0 && (
        <p className="mb-3 text-xs text-ink/50">
          Deleted listings are kept here so they can be restored. A restored listing comes back
          hidden from the website, so it can be reviewed before going live again.
        </p>
      )}

      {source.length === 0 ? (
        <EmptyState
          icon={<Home className="h-6 w-6" />}
          title={showingDeleted ? "Nothing deleted" : "No listings yet"}
          message={
            showingDeleted
              ? "Deleted listings show up here and can be restored."
              : "Listings are what the public website shows. Add the first one to get started."
          }
          cta={
            canManage && !showingDeleted ? (
              <button type="button" onClick={() => setOpen({ listing: null, editing: true })} className={buttonClass("primary")}>
                <Plus className="h-4 w-4" /> Add listing
              </button>
            ) : undefined
          }
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-10 text-center text-sm text-ink/55 shadow-card">
          No listings match this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-5 py-3 font-bold">Property</th>
                <th className="px-5 py-3 font-bold">Category</th>
                <th className="px-5 py-3 font-bold">Price</th>
                <th className="px-5 py-3 font-bold">Link</th>
                <th className="px-5 py-3 font-bold">{showingDeleted ? "Deleted" : "Website"}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, i) => (
                <tr
                  key={l.id}
                  onClick={() => setOpen({ listing: l, editing: false })}
                  className={cx(
                    "cursor-pointer border-t border-black/[0.05] transition hover:bg-primary/[0.04]",
                    i % 2 === 1 && "bg-black/[0.015]",
                    showingDeleted && "opacity-70"
                  )}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {!showingDeleted && (
                        <FeaturedToggle l={l} action={toggleFeaturedAction} canManage={canManage} />
                      )}
                      {/* Thumbnail da capa — <img> de propósito (thumbnail
                          interno; next/image exigiria configurar o host). */}
                      {l.cover_photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={l.cover_photo_url}
                          alt=""
                          loading="lazy"
                          className="h-10 w-14 shrink-0 rounded-lg border border-black/[0.08] object-cover"
                        />
                      ) : (
                        <div className="grid h-10 w-14 shrink-0 place-items-center rounded-lg border border-dashed border-black/[0.12] bg-black/[0.02] text-ink/25">
                          <Home className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-ink">
                          {l.address}
                          {l.address2 ? <span className="text-ink/50"> · {l.address2}</span> : null}
                        </div>
                        {specLine(l) && <div className="text-xs text-ink/45">{specLine(l)}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {listingTypeFlags(l).length === 0 ? (
                      <span className="text-ink/40">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {listingTypeFlags(l).map((f) => (
                          <Badge key={f} tone={f === "is_for_sale" ? "gold" : "orange"}>
                            {LISTING_TYPE_FLAG_LABEL[f]}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-ink/75">{priceLabel(l)}</td>
                  <td className="px-5 py-3.5">
                    {externalLinks(l).length === 0 ? (
                      <span className="text-ink/35">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {externalLinks(l).map((x) => (
                          <a
                            key={x.href}
                            href={x.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/[0.06]"
                          >
                            {x.label} <ExternalLink className="h-3 w-3" />
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {showingDeleted ? (
                      <span className="text-xs text-ink/45">
                        {l.archived_at ? new Date(l.archived_at).toLocaleDateString("en-US") : "—"}
                      </span>
                    ) : (
                      <ActiveToggle l={l} action={toggleActiveAction} canManage={canManage} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Janelinha da listing */}
      {open && (
        <Modal onClose={() => setOpen(null)} wide={open.editing || !!open.listing}>
          <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-6 py-4">
            <div className="flex items-start gap-2">
              {open.listing && !open.editing && !open.listing.archived_at && (
                <FeaturedToggle l={open.listing} action={toggleFeaturedAction} canManage={canManage} size="lg" />
              )}
              <div>
                <h3 className="h-display text-lg text-ink">
                  {open.listing ? (open.editing ? "Edit listing" : open.listing.address) : "New listing"}
                </h3>
                {open.listing && !open.editing && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {listingTypeFlags(open.listing).map((f) => (
                      <Badge key={f} tone={f === "is_for_sale" ? "gold" : "orange"}>
                        {LISTING_TYPE_FLAG_LABEL[f]}
                      </Badge>
                    ))}
                    <Badge tone="neutral">{LISTING_STATUS_LABEL[open.listing.listing_status]}</Badge>
                    {open.listing.archived_at && <Badge tone="muted">Deleted</Badge>}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink/45 transition hover:bg-black/[0.04] hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-6 py-5">
            {open.editing ? (
              <ListingForm
                l={open.listing ?? undefined}
                clients={clients}
                properties={properties}
                action={open.listing ? updateAction : createAction}
                submitLabel={open.listing ? "Save changes" : "Create listing"}
                onCancel={() => (open.listing ? setOpen({ listing: open.listing, editing: false }) : setOpen(null))}
                onDone={() => setOpen(null)}
              />
            ) : open.listing ? (
              <>
                {/* Links externos em destaque — é o que a Andrea vai clicar. */}
                {externalLinks(open.listing).length > 0 && (
                  <div className="mb-5 flex flex-wrap gap-2">
                    {externalLinks(open.listing).map((x) => (
                      <a
                        key={x.href}
                        href={x.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClass("ghost")}
                      >
                        <ExternalLink className="h-4 w-4" /> View on {x.label}
                      </a>
                    ))}
                  </div>
                )}

                {/* Fotos: só numa listing que já existe (precisa de id pro
                    caminho no storage). Na criação, salva primeiro e a galeria
                    aparece ao reabrir. */}
                <div className="mb-6 border-t border-black/[0.06] pt-5">
                  <ListingPhotos
                    listingId={open.listing.id}
                    photos={photosByListing[open.listing.id] ?? []}
                    canManage={canManage && !open.listing.archived_at}
                    addAction={addPhotoAction}
                    deleteAction={deletePhotoAction}
                    reorderAction={reorderPhotosAction}
                  />
                </div>

                <div className="mb-5">
                  <DetailRow label="Unit / apt" value={open.listing.address2} />
                  <DetailRow label="Price" value={priceLabel(open.listing)} accent />
                  <DetailRow label="Specs" value={specLine(open.listing)} />
                  <DetailRow
                    label="Available from"
                    value={open.listing.available_date ? new Date(`${open.listing.available_date}T12:00:00Z`).toLocaleDateString("en-US") : null}
                  />
                  <DetailRow
                    label="Managed property"
                    value={
                      open.listing.property_id
                        ? properties.find((p) => p.id === open.listing!.property_id)?.address ?? "Linked"
                        : null
                    }
                  />
                  {/* Interno. A Andrea pediu explicitamente que o dono NUNCA
                      apareça pro público — o site não renderiza este campo. */}
                  <DetailRow
                    label={
                      <span className="inline-flex items-center gap-1">
                        Owner <Lock className="h-3 w-3 text-ink/30" />
                      </span>
                    }
                    value={
                      open.listing.client_id
                        ? clients.find((c) => c.id === open.listing!.client_id)?.name ?? "Linked"
                        : null
                    }
                  />
                  <DetailRow
                    label="Listed as"
                    value={
                      listingTypeFlags(open.listing)
                        .map((f) => LISTING_TYPE_FLAG_LABEL[f])
                        .join(", ") || null
                    }
                  />
                  <DetailRow
                    label="On the website"
                    value={
                      open.listing.archived_at
                        ? "No — deleted"
                        : open.listing.active
                        ? open.listing.featured ? "Yes — featured on the home page" : "Yes"
                        : "No — hidden"
                    }
                  />
                  <DetailRow
                    label="Description"
                    value={open.listing.description ? <span className="whitespace-pre-wrap">{open.listing.description}</span> : null}
                  />
                </div>

                {canManage && (
                  <div className="flex flex-wrap gap-3">
                    {open.listing.archived_at ? (
                      <>
                        <button
                          type="button"
                          disabled={rowPending}
                          onClick={() => open.listing && runRowAction(restoreAction, open.listing, () => setOpen(null))}
                          className={buttonClass("primary")}
                        >
                          {rowPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                          Restore
                        </button>
                        {canPurge && (
                          <button
                            type="button"
                            onClick={() => open.listing && setConfirmPurge(open.listing)}
                            className={buttonClass("danger")}
                          >
                            <AlertTriangle className="h-4 w-4" /> Delete permanently
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setOpen({ listing: open.listing, editing: true })}
                          className={buttonClass("primary")}
                        >
                          <Pencil className="h-4 w-4" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => open.listing && setConfirmDelete(open.listing)}
                          className={buttonClass("danger")}
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </Modal>
      )}

      {/* Confirmação de delete (recuperável) */}
      {confirmDelete && (
        <Modal onClose={() => !rowPending && setConfirmDelete(null)} z={60}>
          <div className="px-6 py-5">
            <h3 className="h-display text-lg text-ink">Delete this listing?</h3>
            <p className="mt-2 text-sm text-ink/70">
              <span className="font-semibold text-ink">{confirmDelete.address}</span> will be removed
              from the list and from the public website. It moves to the{" "}
              <span className="font-semibold text-ink">Deleted</span> tab, so it can be restored if
              this was a mistake.
            </p>
            {rowError && <p className="mt-3 text-sm text-red-600">{rowError}</p>}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                disabled={rowPending}
                onClick={() => runRowAction(deleteAction, confirmDelete, () => { setConfirmDelete(null); setOpen(null); })}
                className={buttonClass("danger")}
              >
                {rowPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {rowPending ? "Deleting…" : "Yes, delete"}
              </button>
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={rowPending} className={buttonClass("ghost")}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmação de expurgo definitivo — OWNER ONLY */}
      {confirmPurge && (
        <Modal onClose={() => !rowPending && setConfirmPurge(null)} z={60}>
          <div className="px-6 py-5">
            <h3 className="h-display text-lg text-ink">Permanently delete this listing?</h3>
            <p className="mt-2 text-sm text-ink/70">
              This erases <span className="font-semibold text-ink">{confirmPurge.address}</span> from
              the database for good, along with any notes and documents attached to it.
            </p>
            <p className="mt-2 text-sm font-semibold text-red-600">
              This cannot be undone — not even by you.
            </p>
            {rowError && <p className="mt-3 text-sm text-red-600">{rowError}</p>}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                disabled={rowPending}
                onClick={() => runRowAction(purgeAction, confirmPurge, () => { setConfirmPurge(null); setOpen(null); })}
                className={buttonClass("danger")}
              >
                {rowPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                {rowPending ? "Deleting…" : "Yes, delete forever"}
              </button>
              <button type="button" onClick={() => setConfirmPurge(null)} disabled={rowPending} className={buttonClass("ghost")}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
