// Parser for the ERP "Stock Issue Listing" / "Stock Receive Listing - By
// Document Number" xlsx reports. Pure: takes a grid of cell values (one array
// per sheet row, 0-based columns; cells swallowed by a merge are null) and
// returns document lines. The xlsx reading itself is in ./xlsx.ts.
//
// Layout (one sheet):
//   title row            "Stock Issue Listing - By Document Number"
//   "Date : 24-10-2026 To 24-10-2026"
//   label row            Document No | Doc Date | Location | Adj Type | Net Amount
//   document row         EXC12345 | 24-Oct-26 | HQ | EXCHANGE DIFF POWER | 450
//   label row            Item | Stock ID | Description | BRAND | POWER | EXPIRE | QTY | Unit Price | Amount
//   item rows …          1 | 0000796638 | Minasoft Care UV SiHy | MNSFCUV | -1.25 | 203007 | 10 | 45 | 450
//   "Sub Total" row, then the next document row and its items …
//   "Grand Total" row
//
// Label and value cells do not sit in exactly the same column (merged cells,
// centred text), so a value is assigned to the label column nearest to it.

export type Cell = string | number | Date | null | undefined;
export type Grid = Cell[][];
export type Kind = "issue" | "receive";

export type ParsedLine = {
  kind: Kind;
  docNo: string;
  docDate: Date; // UTC midnight
  location: string;
  adjType: string;
  netAmount: number | null;
  lineNo: number;
  stockId: string;
  description: string;
  brand: string | null;
  power: string | null;
  expire: string | null;
  quantity: number;
  unitPrice: number | null;
  amount: number | null;
};

export type ParsedListing = {
  kind: Kind;
  dateFrom: Date | null;
  dateTo: Date | null;
  documents: number;
  lines: ParsedLine[];
};

export class ListingError extends Error {}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const text = (c: Cell): string => {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
};

const num = (c: Cell): number | null => {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  const s = text(c).replace(/,/g, "");
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
};

const utc = (y: number, m: number, d: number): Date | null => {
  const date = new Date(Date.UTC(y, m, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m && date.getUTCDate() === d ? date : null;
};

/** "24-Oct-26", "24-Oct-2026", "24-10-2026", "24/10/2026", or an Excel date. */
export function parseDate(c: Cell): Date | null {
  if (c instanceof Date) return utc(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate());
  const s = text(c);
  let m = /^(\d{1,2})[-\/ ]([A-Za-z]{3})[A-Za-z]*[-\/ ](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mon = MONTHS.indexOf(m[2].toLowerCase());
    if (mon < 0) return null;
    return utc(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), mon, Number(m[1]));
  }
  m = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/.exec(s);
  if (m) return utc(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

type Cols<K extends string> = Record<K, number>;

/** Columns of the labels in a label row, or null if this row isn't one. */
function labelCols<K extends string>(row: Cell[], labels: Record<K, string>): Cols<K> | null {
  const cols = {} as Cols<K>;
  for (const k of Object.keys(labels) as K[]) {
    const i = row.findIndex(c => text(c).toLowerCase() === labels[k].toLowerCase());
    if (i < 0) return null;
    cols[k] = i;
  }
  return cols;
}

/** Value of the label `field` taken from the cell of `row` nearest to it. */
function pick<K extends string>(row: Cell[], cols: Cols<K>, strict = true): Record<K, Cell> {
  const out = {} as Record<K, Cell>;
  for (const k of Object.keys(cols) as K[]) out[k] = null;
  const keys = Object.keys(cols) as K[];
  row.forEach((cell, i) => {
    if (text(cell) === "") return;
    let best = keys[0];
    for (const k of keys) if (Math.abs(cols[k] - i) < Math.abs(cols[best] - i)) best = k;
    // Two cells claiming one field means the layout is not what we expect.
    if (out[best] !== null && strict) throw new ListingError(`Unexpected extra value "${text(cell)}" next to "${text(out[best])}".`);
    out[best] = cell;
  });
  return out;
}

const DOC_LABELS = { docNo: "Document No", docDate: "Doc Date", location: "Location", adjType: "Adj Type", netAmount: "Net Amount" };
const ITEM_LABELS = {
  item: "Item", stockId: "Stock ID", description: "Description", brand: "BRAND", power: "POWER",
  expire: "EXPIRE", qty: "QTY", unitPrice: "Unit Price", amount: "Amount",
};

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

export function parseListing(grid: Grid): ParsedListing {
  // Which report is this?
  let kind: Kind | null = null;
  let dateFrom: Date | null = null;
  let dateTo: Date | null = null;
  for (const row of grid.slice(0, 8)) {
    for (const c of row) {
      const s = text(c);
      if (/^stock issue listing/i.test(s)) kind = "issue";
      else if (/^stock receive listing/i.test(s)) kind = "receive";
      const range = /^date\s*:\s*(\S+)\s+to\s+(\S+)/i.exec(s);
      if (range) { dateFrom = parseDate(range[1]); dateTo = parseDate(range[2]); }
    }
  }
  if (!kind) throw new ListingError('This is not a "Stock Issue Listing" or "Stock Receive Listing" report.');

  let docCols: Cols<keyof typeof DOC_LABELS> | null = null;
  let itemCols: Cols<keyof typeof ITEM_LABELS> | null = null;
  let doc: Omit<ParsedLine, "lineNo" | "stockId" | "description" | "brand" | "power" | "expire" | "quantity" | "unitPrice" | "amount"> | null = null;
  let docLines: ParsedLine[] = [];
  let docDeclared: number | null = null;
  const lines: ParsedLine[] = [];
  let documents = 0;
  let grandTotal: number | null = null;

  const closeDoc = (subTotal: number | null) => {
    if (!doc) return;
    const sum = docLines.reduce((t, l) => t + (l.amount ?? 0), 0);
    if (docLines.length === 0) throw new ListingError(`Document ${doc.docNo} has no item lines.`);
    if (docDeclared !== null && !near(sum, docDeclared))
      throw new ListingError(`Document ${doc.docNo}: item amounts add up to ${sum.toFixed(2)} but Net Amount says ${docDeclared.toFixed(2)}.`);
    if (subTotal !== null && !near(sum, subTotal))
      throw new ListingError(`Document ${doc.docNo}: item amounts add up to ${sum.toFixed(2)} but Sub Total says ${subTotal.toFixed(2)}.`);
    lines.push(...docLines);
    doc = null;
    docLines = [];
    docDeclared = null;
  };

  for (const row of grid) {
    const filled = row.filter(c => text(c) !== "");
    if (filled.length === 0) continue;
    const cells = filled.map(text);

    const dl = labelCols(row, DOC_LABELS);
    if (dl) { docCols = dl; continue; }
    const il = labelCols(row, ITEM_LABELS);
    if (il) { itemCols = il; continue; }

    if (cells.some(c => /^sub total$/i.test(c))) {
      closeDoc(filled.map(num).filter((n): n is number => n !== null).at(-1) ?? null);
      continue;
    }
    if (cells.some(c => /^grand total$/i.test(c))) {
      closeDoc(null);
      grandTotal = filled.map(num).filter((n): n is number => n !== null).at(-1) ?? null;
      continue;
    }

    // A document row: has a parseable Doc Date in the Doc Date column.
    if (docCols) {
      const v = pick(row, docCols, false); // an item row also lands here; it just fails the date test
      const date = parseDate(v.docDate);
      if (date && text(v.docNo) && text(v.location)) {
        closeDoc(null);
        documents++;
        docDeclared = num(v.netAmount);
        doc = {
          kind, docNo: text(v.docNo), docDate: date, location: text(v.location),
          adjType: text(v.adjType), netAmount: docDeclared,
        };
        continue;
      }
    }

    // An item row.
    if (doc && itemCols) {
      const v = pick(row, itemCols);
      const lineNo = num(v.item);
      const quantity = num(v.qty);
      if (lineNo === null || !Number.isInteger(lineNo)) continue; // not an item row (page header, notes)
      if (quantity === null || !Number.isInteger(quantity) || quantity <= 0)
        throw new ListingError(`Document ${doc.docNo} item ${lineNo}: QTY "${text(v.qty)}" is not a whole number above zero.`);
      if (!text(v.stockId) || !text(v.description))
        throw new ListingError(`Document ${doc.docNo} item ${lineNo}: Stock ID or Description is missing.`);
      docLines.push({
        ...doc,
        lineNo,
        stockId: text(v.stockId),
        description: text(v.description),
        brand: text(v.brand) || null,
        power: text(v.power) || null,
        expire: text(v.expire) || null,
        quantity,
        unitPrice: num(v.unitPrice),
        amount: num(v.amount),
      });
    }
  }
  closeDoc(null);

  if (documents === 0) throw new ListingError("No documents found in this report.");
  if (grandTotal !== null) {
    const sum = lines.reduce((t, l) => t + (l.amount ?? 0), 0);
    if (!near(sum, grandTotal)) throw new ListingError(`All item amounts add up to ${sum.toFixed(2)} but Grand Total says ${grandTotal.toFixed(2)}.`);
  }
  return { kind, dateFrom, dateTo, documents, lines };
}
