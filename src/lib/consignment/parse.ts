// Reads the "CSG ALL_ECP_Consignment_Stock" workbook into plain consignment lines.
//
// The workbook is a working document, not a database export, so the parser is
// deliberately forgiving:
//  - One sheet per salesperson (plus Dr Specs). Rows are outlets; each product
//    group is a CSG DATE / CSG NO / QTY column triplet, with the group name in
//    the row above the header.
//  - Cells inside a triplet are sometimes swapped (CSG no typed under the date)
//    or merged across two groups, so a record is "a date, a CSG no and a
//    quantity, in any order, within two columns of each other" rather than a
//    fixed column position.
//  - Colour is data. Red text = needs refresh; green fill = new CSG; cyan =
//    refreshed from location (longer expiry); yellow = 2027 clearance stock.
//  - Below each outlet table is a legend and a "recent" block of CSGs
//    (salesman / location / doc.no-date / remark / qty) for outlets that are
//    not in the table yet.
// Sheets that are not outlet tables (OK OPTICAL SUMMARY, BLUE BOX MC, ...) are
// copies of the same data, so they are skipped rather than counted twice.
import type { Cell, CellValue, Workbook, Worksheet } from "exceljs";

export type Tag = "new" | "adjusted" | "clearance";

export type ParsedLine = {
  sheet: string;
  row: number;
  salesperson: string;
  state: string;
  town: string;
  outlet: string;
  product: string;
  family: string;
  csgNo: string | null;
  csgDate: string | null; // YYYY-MM-DD
  qty: number;
  needsRefresh: boolean;
  tag: Tag | null;
  origin: "table" | "recent";
};

export type ParsedOutlet = {
  sheet: string;
  row: number;
  salesperson: string;
  state: string;
  town: string;
  outlet: string;
  origin: "table" | "recent";
};

export type ParsedConsignment = {
  lines: ParsedLine[];
  outlets: ParsedOutlet[];
  sheets: { name: string; outlets: number; lines: number }[];
  ignoredSheets: string[];
  warnings: string[];
};

export class ConsignmentError extends Error {}

// ---------- cell helpers ----------

function cellValue(cell: Cell): unknown {
  // A merged range repeats its top-left value in every cell; keep only the top-left.
  if (cell.isMerged && cell.master.address !== cell.address) return null;
  const v: CellValue = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "result" in v) return (v as { result?: unknown }).result ?? null;
  if (typeof v === "object" && "richText" in v) return (v as { richText: { text: string }[] }).richText.map(t => t.text).join("");
  return null;
}

const text = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").replace(/\s+/g, " ").trim();

// A merged label (the product group name) lives in the top-left cell only.
function labelAt(ws: Worksheet, row: number, cols: number[]): string {
  for (const c of cols) {
    const cell = ws.getCell(row, c);
    const raw = cell.isMerged ? cell.master.value : cell.value;
    const t = typeof raw === "object" && raw && "richText" in raw
      ? (raw as { richText: { text: string }[] }).richText.map(x => x.text).join("")
      : typeof raw === "string" ? raw : "";
    if (t.trim()) return t.replace(/\s+/g, " ").trim();
  }
  return "";
}

const argb = (c: unknown): string | undefined => (c && typeof c === "object" && "argb" in c ? String((c as { argb: unknown }).argb).toUpperCase() : undefined);
const fillOf = (cell: Cell) => (cell.fill && cell.fill.type === "pattern" ? argb(cell.fill.fgColor) : undefined);
const RED = "FFFF0000";
const FILL_TAG: Record<string, Tag> = { FF66FF66: "new", FF00FFFF: "adjusted", FFFFFF00: "clearance" };
const TAG_ORDER: Tag[] = ["clearance", "adjusted", "new"];

// ---------- names ----------

const STATES = new Set([
  "JOHOR", "KEDAH", "KELANTAN", "MELAKA", "NEGERI SEMBILAN", "PAHANG", "PERAK", "PERLIS", "PENANG", "SABAH",
  "SARAWAK", "SELANGOR", "TERENGGANU", "KUALA LUMPUR", "PUTRAJAYA", "LABUAN",
]);

const title = (s: string) => s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, p, c) => p + c.toUpperCase());

const STATE_ALIASES: Record<string, string> = {
  KL: "KUALA LUMPUR", "W.P KUALA LUMPUR": "KUALA LUMPUR", "W.P. KUALA LUMPUR": "KUALA LUMPUR", "WP KUALA LUMPUR": "KUALA LUMPUR",
  PINANG: "PENANG", "PULAU PINANG": "PENANG",
  "W.P PUTRAJAYA": "PUTRAJAYA", "W.P. PUTRAJAYA": "PUTRAJAYA", "WP PUTRAJAYA": "PUTRAJAYA",
  "W.P LABUAN": "LABUAN", "W.P. LABUAN": "LABUAN",
  "N.SEMBILAN": "NEGERI SEMBILAN", "N. SEMBILAN": "NEGERI SEMBILAN",
};

function cleanPlace(s: string) {
  const u = s.replace(/\s+/g, " ").trim().toUpperCase();
  return STATE_ALIASES[u] ?? u;
}

// "KUANTAN / PAHANG" typed into the wrong columns: put the state in State.
function fixPlace(stateIn: string, townIn: string) {
  let state = cleanPlace(stateIn);
  let town = townIn.replace(/\s+/g, " ").trim().toUpperCase();
  const townAsState = cleanPlace(townIn);
  if (!STATES.has(state) && STATES.has(townAsState)) [state, town] = [townAsState, state];
  return { state: title(state), town: title(town) };
}

// The "DR SPECS - SUMMARY" sheet lists key accounts, with an account code where
// the other sheets have a salesperson.
const ACCOUNTS: Record<string, string> = {
  DR: "Dr Specs", JC: "Jac's Optometry", "81": "Optics 81", SH: "Specs House", MX: "Max Vision", MG: "Mag Eyewear",
};

function salesName(raw: string, sheet: string) {
  const s = raw.trim().toUpperCase();
  if (!s) return title(sheet.replace(/ - .*$/, ""));
  if (ACCOUNTS[s]) return ACCOUNTS[s];
  if (s === "SAKINA" || s === "SHAKINAH") return "Sakina";
  return title(s);
}

export const outletKey = (name: string) => name.replace(/\s+/g, " ").trim().toUpperCase();

const cleanOutlet = (name: string) => name.replace(/\s+/g, " ").trim();

export function normalizeProduct(label: string): { product: string; family: string } {
  const u = label.replace(/\s+/g, " ").trim().toUpperCase();
  const out = (product: string, family: string) => ({ product, family });
  if (/^EC\b/.test(u) || /^EC-/.test(u)) {
    if (/RICH MAKE.*TORIC/.test(u)) return out("Eye Coffret Rich Make Toric", "Eye Coffret");
    if (/TOIC|TORIC/.test(u)) return out("Eye Coffret Toric 10pcs", "Eye Coffret");
    if (/\bBM\b/.test(u)) return out("Eye Coffret BM · NM · RM", "Eye Coffret");
    if (/\bFM\b/.test(u)) return out("Eye Coffret FM · SW · SHM", "Eye Coffret");
    if (/\bSTM\b/.test(u)) return out("Eye Coffret STM · DWM", "Eye Coffret");
    return out(title(label), "Eye Coffret");
  }
  if (/MINASOFT CARE/.test(u)) return out("Minasoft Care UV", "Minasoft");
  if (/MINASOFT/.test(u)) return out("Minasoft 1-Day UV", "Minasoft");
  if (/MONTHLY COLOR.*PEGA/.test(u)) return out("Monthly Color Pega", "Monthly Color");
  if (/^MC\b/.test(u) || /^MONTHLY COLOR/.test(u)) {
    if (/\[\s*DB/.test(u)) return out("Monthly Color · DB DY FB FY NB NY", "Monthly Color");
    if (/\[\s*G\.?B/.test(u)) return out("Monthly Color · GB · GY", "Monthly Color");
    if (/OREN|ORANGE/.test(u)) return out("Monthly Color · orange box", "Monthly Color");
    if (/BLUE/.test(u) || /^MC N[YB]/.test(u)) return out("Monthly Color · blue box", "Monthly Color");
    if (/^MC 2/.test(u)) return out("Monthly Color 2 · DB · DY", "Monthly Color");
    return out(title(label), "Monthly Color");
  }
  if (/SILFA/.test(u)) return out("1-Day Pure Silfa", "1-Day Pure");
  if (/EDOF/.test(u)) return out("1-Day Pure EDOF", "1-Day Pure");
  if (/VIEW SUPPORT/.test(u)) return out("1-Day Pure View Support", "1-Day Pure");
  if (/^1 ?DAY ?PURE/.test(u)) return out("1-Day Pure", "1-Day Pure");
  if (/MONTHLY PURE|MTH PURE/.test(u)) {
    if (/3/.test(u)) return out("Monthly Pure 3pcs", "Monthly Pure");
    if (/6/.test(u)) return out("Monthly Pure 6pcs", "Monthly Pure");
    return out("Monthly Pure", "Monthly Pure");
  }
  if (/FINE UV/.test(u)) return out("Monthly Fine UV Plus", "Fine UV");
  if (/MERURU/.test(u)) return out("Meruru", "Meruru");
  if (/DISOP|HIDROHEALTH/.test(u)) return out(/60/.test(u) && !/360/.test(u) ? "Disop 60ml" : "Disop 360ml", "Solutions");
  if (/ACUAIS/.test(u)) return out("Acuaiss Ultra", "Solutions");
  return out(label ? title(label) : "Unlabelled product", "Other");
}

// ---------- records ----------

type Kind = "date" | "csg" | "qty";
type Item = { kind: Kind; col: number; value: Date | string | number; cell: Cell };

const CSG_RE = /^CS[GF]?\s*\d+/i; // "CSF04001" and "CS03207" are typos for CSG in the source

function dmy(d: string, m: string, y: string) {
  const yy = y.length === 2 ? 2000 + Number(y) : Number(y);
  const dt = new Date(Date.UTC(yy, Number(m) - 1, Number(d)));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function classify(v: unknown): { kind: Kind; value: Date | string | number } | null {
  if (v instanceof Date) return { kind: "date", value: v };
  if (typeof v === "number") return v > 0 && Number.isFinite(v) ? { kind: "qty", value: Math.round(v) } : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (CSG_RE.test(s)) return { kind: "csg", value: s.replace(/\s+/g, "").toUpperCase() };
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const d = dmy(m[1], m[2], m[3]);
    return d ? { kind: "date", value: d } : null;
  }
  const q = s.match(/^(\d+)\s*(BOXES|BOX|BX|PCS|PC)?$/i);
  if (q) return { kind: "qty", value: Number(q[1]) };
  return null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// A mistyped year (0202, 20025) would put the stock 1800 years old.
const sane = (d: string): string | null => {
  const y = Number(d.slice(0, 4));
  return y >= 2018 && y <= 2028 ? d : null;
};

type Group = { label: string; product: string; family: string; cols: number[] };

function findGroups(ws: Worksheet, headerRow: number): Group[] {
  const groups: Group[] = [];
  const header = ws.getRow(headerRow);
  for (let c = 3; c <= ws.columnCount; c++) {
    if (!/^(QTY|QUANTITY)$/i.test(text(cellValue(header.getCell(c))))) continue;
    const cols = [c - 2, c - 1, c];
    const label = labelAt(ws, headerRow - 1, [c, c - 1, c - 2]);
    // A "TOTAL" column, or a label overwritten by a SUM(), is not a product.
    if (/^TOTAL$/i.test(label)) continue;
    const { product, family } = normalizeProduct(label);
    groups.push({ label, product, family, cols });
  }
  return groups;
}

// An outlet table has OUTLET and STATE headers; scratch lists that only have
// OUTLET (collect consignment, OK Optical summary) are copies of the same data.
function findHeaderRow(ws: Worksheet): number | null {
  for (let r = 1; r <= Math.min(4, ws.rowCount); r++) {
    const row = ws.getRow(r);
    let outlet = false;
    let state = false;
    for (let c = 1; c <= Math.min(10, ws.columnCount); c++) {
      const t = text(cellValue(row.getCell(c)));
      if (/^OUTLET$/i.test(t)) outlet = true;
      if (/^STATE$/i.test(t)) state = true;
    }
    if (outlet && state) return r;
  }
  return null;
}

function colByHeader(ws: Worksheet, headerRow: number, names: RegExp, fallback: number) {
  const row = ws.getRow(headerRow);
  for (let c = 1; c <= 8; c++) if (names.test(text(cellValue(row.getCell(c))))) return c;
  return fallback;
}

type Context = { sheet: string; row: number; salesperson: string; state: string; town: string; outlet: string; origin: "table" | "recent" };

function toLine(ctx: Context, g: { product: string; family: string }, items: Item[]): ParsedLine | null {
  const qty = items.find(i => i.kind === "qty");
  if (!qty) return null;
  const csg = items.find(i => i.kind === "csg");
  const date = items.find(i => i.kind === "date");
  let needsRefresh = false;
  const tags = new Set<Tag>();
  for (const i of items) {
    if (argb(i.cell.font?.color) === RED) needsRefresh = true;
    const t = FILL_TAG[fillOf(i.cell) ?? ""];
    if (t) tags.add(t);
  }
  return {
    ...ctx,
    product: g.product,
    family: g.family,
    csgNo: csg ? (csg.value as string) : null,
    csgDate: date ? sane(iso(date.value as Date)) : null,
    qty: qty.value as number,
    needsRefresh,
    tag: TAG_ORDER.find(t => tags.has(t)) ?? null,
  };
}

function parseTableRow(ws: Worksheet, rowNo: number, groups: Group[], ctx: Context, warn: (m: string) => void): ParsedLine[] {
  const colGroup = new Map<number, Group>();
  for (const g of groups) for (const c of g.cols) colGroup.set(c, g);
  const cols = [...colGroup.keys()].sort((a, b) => a - b);
  const row = ws.getRow(rowNo);

  const lines: ParsedLine[] = [];
  let cur: Item[] = [];
  const flush = () => {
    if (!cur.length) return;
    const g = colGroup.get(cur[0].col)!;
    const line = toLine(ctx, g, cur);
    if (line) lines.push(line);
    else {
      const csg = cur.find(i => i.kind === "csg");
      warn(`${ctx.sheet} row ${rowNo}: ${ctx.outlet} has ${csg ? csg.value : "an entry"} under ${g.product} but no quantity, so it was left out.`);
    }
    cur = [];
  };

  for (const c of cols) {
    const cell = row.getCell(c);
    const v = cellValue(cell);
    if (v === null || v === "") continue;
    const k = classify(v);
    if (!k) {
      const t = text(v);
      if (t) warn(`${ctx.sheet} row ${rowNo}: ignored "${t.slice(0, 40)}" under ${colGroup.get(c)!.product}.`);
      continue;
    }
    // Start a new record when the previous one is complete, already has this
    // kind of value, or this cell is more than two columns away.
    if (cur.length && (cur.some(i => i.kind === k.kind) || c - cur[cur.length - 1].col > 2)) flush();
    cur.push({ ...k, col: c, cell });
    if (cur.length === 3) flush();
  }
  flush();
  return lines;
}

// "CSG03947-23/7/2026" -> CSG03947 on 2026-07-23.
function parseDocDate(s: string): { csgNo: string | null; csgDate: string | null } {
  const t = s.replace(/\s+/g, " ").trim();
  const m = t.match(/^(CS[GF]\s*\d+)\s*[-–/ ]\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/i);
  if (m) {
    const d = dmy(m[2], m[3], m[4]);
    return { csgNo: m[1].replace(/\s+/g, "").toUpperCase(), csgDate: d ? iso(d) : null };
  }
  const n = t.match(/^(CS[GF]\s*\d+)/i);
  return { csgNo: n ? n[1].replace(/\s+/g, "").toUpperCase() : null, csgDate: null };
}

function parseRecentRow(ws: Worksheet, rowNo: number, sheet: string, warn: (m: string) => void): { line: ParsedLine; outlet: ParsedOutlet } | null {
  const row = ws.getRow(rowNo);
  const outlet = cleanOutlet(text(cellValue(row.getCell(5))));
  const qtyCell = row.getCell(8);
  const qtyRaw = cellValue(qtyCell);
  const qty = typeof qtyRaw === "number" ? Math.round(qtyRaw) : Number(text(qtyRaw));
  if (!outlet) return null;
  if (!Number.isFinite(qty) || qty <= 0) {
    warn(`${sheet} row ${rowNo}: ignored recent CSG for "${outlet}" with no quantity.`);
    return null;
  }
  const docCell = row.getCell(6);
  const docVal = cellValue(docCell);
  const { csgNo, csgDate } = parseDocDate(text(docVal));
  const remark = text(cellValue(row.getCell(7))).toUpperCase();
  const product = remark === "MC" ? { product: "Monthly Color (box not stated)", family: "Monthly Color" }
    : remark === "EC" ? { product: "Eye Coffret (type not stated)", family: "Eye Coffret" }
    : { product: remark ? title(remark) : "Unlabelled product", family: "Other" };
  const ctx: Context = {
    sheet, row: rowNo, salesperson: salesName(text(cellValue(row.getCell(4))), sheet),
    state: "", town: "", outlet, origin: "recent",
  };
  const items: Item[] = [{ kind: "qty", col: 8, value: qty, cell: qtyCell }];
  const line = toLine(ctx, product, items)!;
  line.csgNo = csgNo;
  line.csgDate = csgDate ? sane(csgDate) : null;
  line.needsRefresh = argb(docCell.font?.color) === RED || argb(qtyCell.font?.color) === RED;
  line.tag = FILL_TAG[fillOf(docCell) ?? ""] ?? FILL_TAG[fillOf(qtyCell) ?? ""] ?? null;
  const { origin: _o, row: _r, sheet: _s, ...place } = ctx;
  return { line, outlet: { sheet, row: rowNo, origin: "recent", ...place } };
}

// ---------- workbook ----------

export function parseConsignment(wb: Workbook): ParsedConsignment {
  const lines: ParsedLine[] = [];
  const outlets: ParsedOutlet[] = [];
  const sheets: ParsedConsignment["sheets"] = [];
  const ignoredSheets: string[] = [];
  const warnings: string[] = [];
  const warn = (m: string) => { if (warnings.length < 60) warnings.push(m); };

  for (const ws of wb.worksheets) {
    const headerRow = findHeaderRow(ws);
    const groups = headerRow ? findGroups(ws, headerRow) : [];
    if (!headerRow || !groups.length) {
      ignoredSheets.push(ws.name);
      continue;
    }
    const cState = colByHeader(ws, headerRow, /^STATE$/i, 2);
    const cTown = colByHeader(ws, headerRow, /^(TOWN|AREA)$/i, 3);
    const cSales = colByHeader(ws, headerRow, /^SALES(MAN)?$/i, 4);
    const cOutlet = colByHeader(ws, headerRow, /^OUTLET$/i, 5);

    let sheetLines = 0;
    let sheetOutlets = 0;
    let recent = false;
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      // "salesman | location | doc.no/date | remark | qty" starts the recent block.
      if (/^SALESM/i.test(text(cellValue(row.getCell(4)))) && /^LOCATION$/i.test(text(cellValue(row.getCell(5))))) {
        recent = true;
        continue;
      }
      if (recent) {
        const rec = parseRecentRow(ws, r, ws.name, warn);
        if (rec) { lines.push(rec.line); outlets.push(rec.outlet); sheetLines++; sheetOutlets++; }
        continue;
      }
      const name = cleanOutlet(text(cellValue(row.getCell(cOutlet))));
      if (!name) continue;
      const { state, town } = fixPlace(text(cellValue(row.getCell(cState))), text(cellValue(row.getCell(cTown))));
      const ctx: Context = {
        sheet: ws.name, row: r, salesperson: salesName(text(cellValue(row.getCell(cSales))), ws.name),
        state, town, outlet: name, origin: "table",
      };
      outlets.push({ sheet: ws.name, row: r, salesperson: ctx.salesperson, state, town, outlet: name, origin: "table" });
      sheetOutlets++;
      const found = parseTableRow(ws, r, groups, ctx, warn);
      lines.push(...found);
      sheetLines += found.length;
    }
    sheets.push({ name: ws.name, outlets: sheetOutlets, lines: sheetLines });
  }

  if (!sheets.length) {
    throw new ConsignmentError("No outlet sheets found. Each sheet needs an OUTLET column and CSG DATE / CSG NO / QTY columns.");
  }

  // The recent block re-lists CSGs that are already in the table (with the
  // quantity as first requested), so a table entry always wins.
  const tableCsg = new Set(lines.filter(l => l.origin === "table" && l.csgNo).map(l => `${outletKey(l.outlet)}|${l.csgNo}`));
  const afterRecent = lines.filter(l => l.origin === "table" || !l.csgNo || !tableCsg.has(`${outletKey(l.outlet)}|${l.csgNo}`));

  // The same CSG can be typed twice for an outlet (a repeated outlet row). Keep one.
  const seen = new Set<string>();
  const unique = afterRecent.filter(l => {
    if (!l.csgNo) return true;
    const k = `${outletKey(l.outlet)}|${l.origin === "recent" ? "" : l.product}|${l.csgNo}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const dropped = lines.length - unique.length;
  if (dropped) warn(`${dropped} repeated CSG entr${dropped === 1 ? "y was" : "ies were"} counted once.`);

  // Recent-block rows have no state or town: borrow them from the outlet table.
  const place = new Map<string, { state: string; town: string }>();
  for (const o of outlets) if (o.origin === "table" && !place.has(outletKey(o.outlet))) place.set(outletKey(o.outlet), o);
  for (const x of [...unique, ...outlets]) {
    if (x.origin !== "recent") continue;
    const p = place.get(outletKey(x.outlet));
    if (p) { x.state = p.state; x.town = p.town; }
  }
  for (const x of [...unique, ...outlets]) if (!x.state) x.state = "Unknown";

  return { lines: unique, outlets, sheets, ignoredSheets, warnings };
}
