// Reads the ERP's printed "CONSIGNMENT" documents (one per CSG number) into
// lines of colour, power and quantity.
//
// The export is a print layout, not a table. Each page repeats a header block
// (FROM COUNTER, TO COUNTER, CONSIGN NO, DATE, SALESPERSON ...), then each box
// is three rows: expiry (YYYYMM), MDA no, and the item row
//   Item | Stock ID | Description | Power | Quantity | Uom
// The document ends with a printed total, a "Remark :" block and a signature
// area. Several documents (or pages) can sit in one file, so a document starts
// wherever a new CONSIGN NO appears and its pages are merged.
import type { Workbook } from "exceljs";
import { cellValue, text } from "./parse";

export type DocLine = {
  itemNo: number;
  stockId: string;
  description: string;
  power: string | null;
  extra: string | null; // anything else printed between description and quantity (cylinder, axis ...)
  expire: string | null; // YYYYMM, as printed
  mdaNo: string | null;
  qty: number;
  uom: string;
};

export type ParsedDoc = {
  csgNo: string;
  docDate: string | null; // YYYY-MM-DD
  toCounter: string;
  fromCounter: string;
  salesperson: string;
  createdBy: string;
  printedTotal: number | null;
  remark: string;
  lines: DocLine[];
};

export type ParsedDocs = { docs: ParsedDoc[]; warnings: string[] };

export class DocError extends Error {}

const LABELS = new Set(["FROM COUNTER", "TO COUNTER", "CONSIGN NO", "DATE", "SALESPERSON", "CREATED BY", "ATTENTION", "ADDRESS", "PAGE"]);
const norm = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();

type C = { col: number; value: unknown };

const isInt = (v: unknown) => (typeof v === "number" && Number.isInteger(v)) || (typeof v === "string" && /^\d+$/.test(v.trim()));
const num = (v: unknown) => (typeof v === "number" ? v : Number(String(v).trim()));

function parseDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = text(v).match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** "-1.25", "0.00", "+1.00"; anything that is not a number is kept as printed. */
export function normPower(v: unknown): string {
  const s = text(v);
  const n = typeof v === "number" ? v : Number(s);
  if (s === "" || Number.isNaN(n)) return s;
  return n > 0 ? `+${n.toFixed(2)}` : n === 0 ? "0.00" : n.toFixed(2);
}

export function parseCsgDocs(wb: Workbook): ParsedDocs {
  const byNo = new Map<string, ParsedDoc>();
  const order: ParsedDoc[] = [];
  const warnings: string[] = [];
  const warn = (m: string) => { if (warnings.length < 40) warnings.push(m); };

  for (const ws of wb.worksheets) {
    let cur: ParsedDoc | null = null;
    let pendingExpire: string | null = null;
    let pendingMda: string | null = null;
    let lastLone: number | null = null;
    let inRemark = false;
    const remark: string[] = [];

    const closeRemark = () => {
      if (cur && remark.length) cur.remark = remark.join(" ").trim();
      remark.length = 0;
      inRemark = false;
    };

    ws.eachRow({ includeEmpty: false }, (row, r) => {
      const cells: C[] = [];
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const v = cellValue(cell);
        if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return;
        cells.push({ col, value: typeof v === "string" ? v.trim() : v });
      });
      if (!cells.length) return;

      // ---- header labels (value is the next cell that is not ":" or another label) ----
      let sawLabel = false;
      for (let i = 0; i < cells.length; i++) {
        const label = norm(text(cells[i].value));
        if (!LABELS.has(label)) continue;
        sawLabel = true;
        let val: unknown = null;
        for (let j = i + 1; j < cells.length; j++) {
          const t = text(cells[j].value);
          if (t === ":" || LABELS.has(norm(t))) { if (LABELS.has(norm(t))) break; continue; }
          val = cells[j].value;
          break;
        }
        if (val === null) continue;
        if (label === "CONSIGN NO") {
          closeRemark();
          const no = text(val).toUpperCase().replace(/\s+/g, "");
          let d = byNo.get(no);
          if (!d) {
            d = { csgNo: no, docDate: null, toCounter: "", fromCounter: "", salesperson: "", createdBy: "", printedTotal: null, remark: "", lines: [] };
            byNo.set(no, d);
            order.push(d);
          }
          cur = d;
          pendingExpire = pendingMda = null;
        } else if (cur) {
          if (label === "DATE") cur.docDate = parseDate(val) ?? cur.docDate;
          else if (label === "TO COUNTER") cur.toCounter = text(val);
          else if (label === "FROM COUNTER") cur.fromCounter = text(val);
          else if (label === "SALESPERSON") cur.salesperson = text(val);
          else if (label === "CREATED BY") cur.createdBy = text(val);
        }
      }
      if (sawLabel) return;

      const first = text(cells[0].value);

      // ---- remark block and signature area ----
      if (/^REMARK\b/i.test(first)) {
        if (cur) cur.printedTotal = lastLone;
        inRemark = true;
        return;
      }
      if (/^THIS IS COMPUTER GENERATED/i.test(first)) { closeRemark(); return; }
      if (inRemark) { remark.push(cells.map(c => text(c.value)).join(" ")); return; }

      // ---- item row: Item | Stock ID | Description | [Power ...] | Quantity | Uom ----
      if (cells.length >= 5 && isInt(cells[0].value) && typeof cells[1].value === "string" && typeof cells[2].value === "string") {
        if (!cur) { warn(`${ws.name} row ${r}: an item line appears before any CONSIGN NO, so it was left out.`); return; }
        let rest = cells.slice(3).map(c => c.value);
        let uom = "BOX";
        const tail = rest[rest.length - 1];
        if (typeof tail === "string" && /^[A-Za-z]+$/.test(tail)) { uom = tail.toUpperCase(); rest = rest.slice(0, -1); }
        const qtyV = rest[rest.length - 1];
        rest = rest.slice(0, -1);
        const qty = typeof qtyV === "number" || (typeof qtyV === "string" && /^\d+$/.test(qtyV)) ? Math.round(num(qtyV)) : NaN;
        if (!Number.isFinite(qty) || qty <= 0) {
          warn(`${cur.csgNo} item ${text(cells[0].value)}: no quantity, so it was left out.`);
          return;
        }
        cur.lines.push({
          itemNo: num(cells[0].value),
          stockId: text(cells[1].value),
          description: text(cells[2].value),
          power: rest.length ? normPower(rest[0]) : null,
          extra: rest.length > 1 ? rest.slice(1).map(text).join(" ") : null,
          expire: pendingExpire,
          mdaNo: pendingMda,
          qty,
          uom,
        });
        pendingExpire = pendingMda = null;
        return;
      }

      // ---- the rows above an item hold its expiry (YYYYMM) and MDA no ----
      let handled = false;
      for (const c of cells) {
        const t = text(c.value);
        if (/^\d{6}$/.test(t)) { pendingExpire = t; handled = true; }
        else if (/^[A-Z]{1,3}\d[\dA-Z-]*$/i.test(t)) { pendingMda = t; handled = true; }
      }
      if (!handled && cells.length === 1 && isInt(cells[0].value)) lastLone = num(cells[0].value);
    });
    closeRemark();
  }

  const docs: ParsedDoc[] = [];
  for (const d of order) {
    if (!d.lines.length) { warn(`${d.csgNo}: no item lines were found, so it was left out.`); continue; }
    const sum = d.lines.reduce((s, l) => s + l.qty, 0);
    if (d.printedTotal !== null && d.printedTotal !== sum) {
      warn(`${d.csgNo}: the document prints a total of ${d.printedTotal} but its lines add up to ${sum}.`);
    }
    docs.push(d);
  }
  if (!docs.length) throw new DocError("No consignment documents found. Upload the ERP's printed CSG document (.xlsx).");
  return { docs, warnings };
}

// ---------- describing a line ----------

/** "Monthly Color UV - Fire Brown" -> colour "Fire Brown"; "ECF10-M FIRST MAKE" -> "FIRST MAKE". */
export function splitDescription(description: string): { product: string; colour: string } {
  const dash = description.lastIndexOf(" - ");
  if (dash > 0) return { product: description.slice(0, dash).trim(), colour: description.slice(dash + 3).trim() };
  const code = description.match(/^([A-Z]{2,4}\d+-[A-Z])\s+(.+)$/);
  if (code) return { product: code[1], colour: code[2].trim() };
  return { product: "", colour: description };
}
