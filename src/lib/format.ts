// Formatadores. Dinheiro em USD, datas em America/New_York (Cape Cod).

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return USD.format(value);
}

const DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function date(value: string | null | undefined): string {
  if (!value) return "—";
  // Datas "date" do Postgres vêm como YYYY-MM-DD — tratar como local, sem deslocar.
  const iso = value.length === 10 ? `${value}T12:00:00` : value;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE.format(d);
}

// Combina classes condicionais sem dependência externa.
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
