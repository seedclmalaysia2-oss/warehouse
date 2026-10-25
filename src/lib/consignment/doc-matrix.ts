// Turns a CSG document's lines into a colour x power grid for the Details view.
// Server side: it uses splitDescription from the document parser.
import { splitDescription } from "./doc-parse";
import type { DocView } from "./doc-store";

export type MatrixRow = {
  colour: string;
  product: string;
  /** Quantity per power, aligned with Matrix.powers; 0 when none. */
  cells: number[];
  total: number;
  /** Earliest expiry on this colour, as "Jun 2027". */
  expiry: string | null;
  /** More than one expiry date on this colour. */
  mixedExpiry: boolean;
};

export type Matrix = {
  powers: string[];
  rows: MatrixRow[];
  colTotals: number[];
  total: number;
  /** Boxes are listed one line per box on the document. */
  lineCount: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "202706" -> "Jun 2027"; anything else is shown as printed. */
export function fmtExpiry(e: string): string {
  const m = e.match(/^(\d{4})(\d{2})$/);
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : e;
}

const powerValue = (p: string) => {
  const n = Number(p);
  return Number.isNaN(n) ? Number.NEGATIVE_INFINITY : n;
};

export function buildMatrix(lines: DocView["lines"]): Matrix {
  const products = new Set(lines.map(l => splitDescription(l.description).product));
  const sameProduct = products.size <= 1;

  const powerKey = (l: DocView["lines"][number]) => [l.power ?? "", l.extra ?? ""].filter(Boolean).join(" ") || "Any";
  const powers = [...new Set(lines.map(powerKey))].sort((a, b) => {
    const d = powerValue(b) - powerValue(a);
    return d !== 0 && !Number.isNaN(d) ? d : a.localeCompare(b);
  });
  const col = new Map(powers.map((p, i) => [p, i]));

  const byRow = new Map<string, { colour: string; product: string; cells: number[]; expiries: Set<string> }>();
  for (const l of lines) {
    const { product, colour } = splitDescription(l.description);
    const key = l.description;
    let r = byRow.get(key);
    if (!r) {
      r = { colour: sameProduct ? colour || l.description : [product, colour].filter(Boolean).join(" - "), product, cells: powers.map(() => 0), expiries: new Set() };
      byRow.set(key, r);
    }
    r.cells[col.get(powerKey(l))!] += l.qty;
    if (l.expire) r.expiries.add(l.expire);
  }

  const rows: MatrixRow[] = [...byRow.values()].map(r => {
    const sorted = [...r.expiries].sort();
    return {
      colour: r.colour, product: r.product, cells: r.cells, total: r.cells.reduce((s, n) => s + n, 0),
      expiry: sorted.length ? fmtExpiry(sorted[0]) : null, mixedExpiry: sorted.length > 1,
    };
  });
  rows.sort((a, b) => a.colour.localeCompare(b.colour));

  const colTotals = powers.map((_, i) => rows.reduce((s, r) => s + r.cells[i], 0));
  return { powers, rows, colTotals, total: colTotals.reduce((s, n) => s + n, 0), lineCount: lines.length };
}
