// Pure helpers behind the ECP Consignment page. Safe on server and client: no
// I/O, and "today" is always passed in so both render the same ages.
//
// There is no expiry date in the consignment workbook, only the CSG date, so
// the age of a CSG (today minus CSG date) is the proxy for how long stock has
// sat on a shelf.

export type Tag = "new" | "adjusted" | "clearance";

export type Line = {
  outlet: string;
  owner: string; // salesperson, or key account on the Dr Specs sheet
  state: string;
  town: string;
  product: string;
  family: string;
  csgNo: string | null;
  csgDate: string | null; // YYYY-MM-DD
  qty: number;
  needsRefresh: boolean;
  tag: Tag | null;
};

export type OutletRef = { outlet: string; owner: string; state: string; town: string };

export const BANDS = [
  { key: "fresh", label: "Under 6 months", maxDays: 183 },
  { key: "mid", label: "6 to 12 months", maxDays: 365 },
  { key: "old", label: "1 to 2 years", maxDays: 730 },
  { key: "stale", label: "Over 2 years", maxDays: Infinity },
] as const;
export const UNDATED = { key: "undated", label: "No CSG date" } as const;
/** Index of the first band counted as "over a year". */
export const OVER_YEAR_FROM = 2;

export const BAND_COUNT = BANDS.length + 1; // + undated
export const zeroBands = () => new Array<number>(BAND_COUNT).fill(0);

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function bandOf(days: number | null): number {
  if (days === null) return BANDS.length;
  const i = BANDS.findIndex(b => days <= b.maxDays);
  return i === -1 ? BANDS.length - 1 : i;
}

/** "5 days", "8 mo", "2 yr 3 mo". */
export function ageText(days: number | null): string {
  if (days === null) return "No date";
  if (days < 0) return "Future date";
  if (days < 45) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.round(days / 30.4375);
  if (months < 24) return `${months} mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y} yr ${m} mo` : `${y} yr`;
}

export const outletKey = (name: string) => name.replace(/\s+/g, " ").trim().toUpperCase();

export type AgedLine = Line & { days: number | null; band: number };

export const withAge = (l: Line, today: string): AgedLine => {
  const days = l.csgDate ? daysBetween(l.csgDate, today) : null;
  return { ...l, days, band: bandOf(days) };
};

// ---------- filters ----------

export type Filters = { owner: string; state: string; product: string };
export const NO_FILTERS: Filters = { owner: "", state: "", product: "" };

export const matches = (l: Pick<Line, "owner" | "state" | "product">, f: Filters) =>
  (!f.owner || l.owner === f.owner) && (!f.state || l.state === f.state) && (!f.product || l.product === f.product);

// ---------- outlets ----------

export type OutletRow = {
  key: string;
  name: string;
  owners: string[];
  state: string;
  town: string;
  units: number;
  csgDocs: number;
  lines: AgedLine[];
  bands: number[]; // units per band
  oldestDays: number | null;
  refreshLines: number;
  clearanceLines: number;
  overYearUnits: number;
};

/**
 * One row per outlet. `lines` are the aged lines that survived the filters;
 * `refs` are every outlet the workbook lists, so outlets with nothing on
 * consignment still appear (as zero), which is itself something to watch.
 */
export function buildOutletRows(lines: AgedLine[], refs: OutletRef[], filters: Filters): OutletRow[] {
  type Acc = { name: string; owners: Set<string>; refOwners: Set<string>; state: string; town: string; lines: AgedLine[] };
  const map = new Map<string, Acc>();
  const get = (name: string, state: string, town: string) => {
    const key = outletKey(name);
    let a = map.get(key);
    if (!a) map.set(key, (a = { name, owners: new Set(), refOwners: new Set(), state, town, lines: [] }));
    return a;
  };

  for (const r of refs) {
    if (!matches({ owner: r.owner, state: r.state, product: filters.product }, filters)) continue;
    get(r.outlet, r.state, r.town).refOwners.add(r.owner);
  }
  for (const l of lines) {
    const a = get(l.outlet, l.state, l.town);
    a.owners.add(l.owner);
    a.lines.push(l);
  }

  return [...map.entries()].map(([key, a]) => {
    const bands = zeroBands();
    const docs = new Set<string>();
    let units = 0;
    let oldest: number | null = null;
    let refreshLines = 0;
    let clearanceLines = 0;
    for (const l of a.lines) {
      bands[l.band] += l.qty;
      units += l.qty;
      if (l.csgNo) docs.add(l.csgNo);
      if (l.days !== null && (oldest === null || l.days > oldest)) oldest = l.days;
      if (l.needsRefresh) refreshLines++;
      if (l.tag === "clearance") clearanceLines++;
    }
    a.lines.sort((x, y) => (y.days ?? -1) - (x.days ?? -1) || y.qty - x.qty);
    const owners = [...(a.owners.size ? a.owners : a.refOwners)].sort();
    return {
      key, name: a.name, owners, state: a.state, town: a.town, units, csgDocs: docs.size, lines: a.lines, bands,
      oldestDays: oldest, refreshLines, clearanceLines,
      overYearUnits: bands.slice(OVER_YEAR_FROM, BANDS.length).reduce((s, n) => s + n, 0),
    };
  });
}

// ---------- grouping and totals ----------

export type GroupKey = "owner" | "state" | "product";
export type Group = { label: string; units: number; bands: number[]; outlets: number; overYearUnits: number };

export function groupLines(lines: AgedLine[], key: GroupKey): Group[] {
  const map = new Map<string, { g: Group; outlets: Set<string> }>();
  for (const l of lines) {
    const label = l[key] || "Unknown";
    let e = map.get(label);
    if (!e) map.set(label, (e = { g: { label, units: 0, bands: zeroBands(), outlets: 0, overYearUnits: 0 }, outlets: new Set() }));
    e.g.units += l.qty;
    e.g.bands[l.band] += l.qty;
    if (l.band >= OVER_YEAR_FROM && l.band < BANDS.length) e.g.overYearUnits += l.qty;
    e.outlets.add(outletKey(l.outlet));
  }
  return [...map.values()].map(e => ({ ...e.g, outlets: e.outlets.size })).sort((a, b) => b.units - a.units);
}

export type Totals = {
  units: number;
  bands: number[];
  outletsHolding: number;
  outletsListed: number;
  csgDocs: number;
  overYearUnits: number;
  refreshLines: number;
  refreshUnits: number;
};

export function totals(lines: AgedLine[], rows: OutletRow[]): Totals {
  const bands = zeroBands();
  const docs = new Set<string>();
  let units = 0;
  let refreshLines = 0;
  let refreshUnits = 0;
  for (const l of lines) {
    units += l.qty;
    bands[l.band] += l.qty;
    if (l.csgNo) docs.add(l.csgNo);
    if (l.needsRefresh) { refreshLines++; refreshUnits += l.qty; }
  }
  return {
    units, bands, csgDocs: docs.size, refreshLines, refreshUnits,
    outletsHolding: rows.filter(r => r.units > 0).length,
    outletsListed: rows.length,
    overYearUnits: bands.slice(OVER_YEAR_FROM, BANDS.length).reduce((s, n) => s + n, 0),
  };
}

// ---------- display ----------

export const fmtInt = (n: number) => n.toLocaleString("en-US");

export function fmtDate(iso: string | null): string {
  if (!iso) return "No date";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Today in Malaysia (UTC+8) as YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}
