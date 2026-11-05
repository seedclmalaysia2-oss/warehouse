// Fills in the Consignment Stock Balance Confirmation for one outlet. The
// letterhead and title come from checklist-letterhead.pdf (the company's Word
// form, exported blank) so they match it exactly; the tables are drawn here
// because their length depends on the outlet.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFEmbeddedPage, type PDFFont, type PDFPage } from "pdf-lib";
import { fmtDate, fmtInt, type CsgGroup } from "./analyze";

export type ChecklistRow = { date: string; csgNo: string; product: string; consigned: number };
export type ChecklistData = { storeName: string; state: string; documentDate: string; rows: ChecklistRow[] };

/**
 * One row per product per CSG. The quantity consigned is the uploaded document's
 * total where that total belongs to a single row; otherwise only the workbook's
 * figure is known. Balance Quantity has no value here: the customer writes it in.
 */
export function checklistRows(csgs: CsgGroup[], docTotals: Map<string, number>): ChecklistRow[] {
  const rowsPerDoc = new Map<string, number>();
  for (const c of csgs) if (c.docKey) rowsPerDoc.set(c.docKey, (rowsPerDoc.get(c.docKey) ?? 0) + c.products.length);
  return csgs.flatMap(c => c.products.map(p => ({
    date: c.csgDate ? fmtDate(c.csgDate) : "",
    csgNo: c.csgNo ?? "",
    product: p.product,
    consigned: (c.docKey && rowsPerDoc.get(c.docKey) === 1 ? docTotals.get(c.docKey) : undefined) ?? p.qty,
  })));
}

const LETTERHEAD = path.join(process.cwd(), "src/lib/consignment/checklist-letterhead.pdf");

// Measured from the form, in points from the top of an A4 page.
const LEFT = 63;
const WIDTH = 474.5;
const TITLE_END = 175;
const LETTERHEAD_END = 84;
const FOOTER_TOP = 765;
const CONTENT_END = 756;
const SIGN_LEFT = 68;
const SIGN_RIGHT = 293;
const MIN_ROWS = 8;
const CONFIRMATION_HEIGHT = 234;
// Wider Product than the form's, so names like "Monthly Color · DB DY FB FY NB NY" stay on one line.
const COLUMNS = [62, 72, 165, 64, 56, 55.5];
const HEADINGS = ["Consignment Date", "Consignment No", "Consignment Product", "Consignment Quantity", "Balance Quantity", ""];
const DETAIL_COLUMNS = [67.5, 157.5, 135, 114.5];
const CONFIRMATION =
  "I/We confirm that the current balance quantities stated above reflect the consignment stock physically available at our ECP as of the verification date. Any discrepancy will be reported to SEED Contact Lens (M) Sdn. Bhd. for reconciliation.";

const NAVY = rgb(0x24 / 255, 0x40 / 255, 0x62 / 255);
const BLUE = rgb(0x44 / 255, 0x72 / 255, 0xc4 / 255);
const LINE = rgb(0xa6 / 255, 0xa6 / 255, 0xa6 / 255);
const INK = rgb(0, 0, 0);
const SOFT = rgb(0x26 / 255, 0x26 / 255, 0x26 / 255);
const WHITE = rgb(1, 1, 1);

export async function buildChecklistPdf(data: ChecklistData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Consignment Stock Balance Confirmation - ${data.storeName}`);
  doc.setAuthor("SEED Contact Lens (M) Sdn. Bhd.");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const [form] = (await PDFDocument.load(await readFile(LETTERHEAD))).getPages();
  const { width: pageW, height: pageH } = form.getSize();
  const band = (from: number, to: number) => ({ left: 0, right: pageW, top: pageH - from, bottom: pageH - to });
  const [firstHead, nextHead, foot] = await doc.embedPages(
    [form, form, form],
    [band(0, TITLE_END), band(0, LETTERHEAD_END), band(FOOTER_TOP, pageH)],
  );

  // pdf-lib throws on anything its fonts can't encode, so a stray character must not cost the whole document.
  const known = new Set(regular.getCharacterSet());
  const clean = (s: string) => [...s.replace(/\s+/g, " ").trim()].map(c => (known.has(c.codePointAt(0)!) ? c : "?")).join("");

  const wrap = (s: string, font: PDFFont, size: number, max: number) => {
    const lines: string[] = [];
    let cur = "";
    for (const word of clean(s).split(" ")) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && font.widthOfTextAtSize(next, size) > max) { lines.push(cur); cur = word; } else cur = next;
    }
    return cur ? [...lines, cur] : [];
  };

  let page!: PDFPage;
  const place = (art: PDFEmbeddedPage, top: number) =>
    page.drawPage(art, { x: 0, y: pageH - top - art.height, width: art.width, height: art.height });
  const newPage = (head: PDFEmbeddedPage) => {
    page = doc.addPage([pageW, pageH]);
    place(head, 0);
    place(foot, FOOTER_TOP);
  };

  const fill = (x: number, top: number, w: number, h: number, color = NAVY) =>
    page.drawRectangle({ x, y: pageH - top - h, width: w, height: h, color });
  const box = (x: number, top: number, w: number, h: number, color = LINE) =>
    page.drawRectangle({ x, y: pageH - top - h, width: w, height: h, borderColor: color, borderWidth: 0.5 });
  const text = (s: string, x: number, baseline: number, size: number, font = regular, color = INK) =>
    page.drawText(s, { x, y: pageH - baseline, size, font, color });
  /** Lines centred on the cell's height; across its width too unless aligned left. */
  const cell = (lines: string[], x: number, top: number, w: number, h: number, size: number, font: PDFFont, color = INK, left = false) => {
    const leading = size + 2;
    lines.forEach((l, i) => {
      const dx = left ? 5 : (w - font.widthOfTextAtSize(l, size)) / 2;
      text(l, x + dx, top + (h - lines.length * leading) / 2 + (i + 1) * leading - 3, size, font, color);
    });
  };
  const bar = (label: string, top: number) => {
    fill(LEFT, top, WIDTH, 16);
    cell([label], LEFT, top, WIDTH, 16, 9.5, bold, WHITE);
  };
  const tableHead = (top: number) => {
    bar("CONSIGNMENT STOCK BALANCE", top);
    fill(LEFT, top + 16, WIDTH, 28, BLUE);
    let x = LEFT;
    COLUMNS.forEach((w, i) => {
      cell(wrap(HEADINGS[i], bold, 9, w - 6), x, top + 16, w, 28, 9, bold, WHITE);
      x += w;
    });
    return top + 44;
  };
  /** A later page, labelled so a loose sheet can still be matched to its outlet. */
  const continuation = () => {
    newPage(nextHead);
    cell([`${clean(data.storeName)} (continued)`], LEFT - 5, 84, WIDTH, 14, 9, bold, INK, true);
  };

  // ---- first page: outlet details ----
  newPage(firstHead);
  bar("OUTLET DETAILS", 187);
  let y = 203;
  for (const row of [["Store Name:", data.storeName, "Document Date:", data.documentDate], ["State:", data.state, "Contact Person:", ""]]) {
    const h = 26;
    let x = LEFT;
    row.forEach((v, i) => {
      const font = i % 2 === 0 ? bold : regular;
      box(x, y, DETAIL_COLUMNS[i], h);
      cell(wrap(v, font, 9, DETAIL_COLUMNS[i] - 10), x, y, DETAIL_COLUMNS[i], h, 9, font, INK, true);
      x += DETAIL_COLUMNS[i];
    });
    y += h;
  }

  // ---- stock table, running onto more pages when long ----
  y = tableHead(266);
  const drawRow = (r: ChecklistRow | null) => {
    const product = r ? wrap(r.product, regular, 9, COLUMNS[2] - 10) : [];
    const h = Math.max(18, product.length * 11 + 6);
    if (y + h > CONTENT_END) {
      continuation();
      y = tableHead(102);
    }
    const values = r ? [[clean(r.date)], [clean(r.csgNo)], product, [fmtInt(r.consigned)], [], []] : COLUMNS.map(() => []);
    let x = LEFT;
    COLUMNS.forEach((w, i) => {
      box(x, y, w, h);
      cell(values[i], x, y, w, h, 9, regular, INK, i === 2);
      x += w;
    });
    y += h;
  };
  data.rows.forEach(drawRow);
  for (let i = data.rows.length; i < MIN_ROWS; i++) drawRow(null);

  // ---- confirmation stays whole, so a signature never sits apart from its wording ----
  y += 12;
  if (y + CONFIRMATION_HEIGHT > CONTENT_END) {
    continuation();
    y = 102;
  }
  bar("CUSTOMER CONFIRMATION", y);
  box(LEFT, y + 16, WIDTH, 40, INK);
  cell(wrap(CONFIRMATION, regular, 8.5, WIDTH - 16), LEFT, y + 16, WIDTH, 40, 8.5, regular, SOFT);
  const sign = y + 95;
  for (const [x, title] of [[SIGN_LEFT, "Prepared / Verified by (SEED):"], [SIGN_RIGHT, "Store Representative :"]] as const) {
    text("Signature & Stamp :", x, sign, 9);
    text(title, x, sign + 98, 9, bold);
    for (const [label, top] of [["Name :", sign + 117], ["Date :", sign + 133]] as const) {
      text(label, x, top, 9);
      page.drawLine({ start: { x: x + 32, y: pageH - top - 1 }, end: { x: x + 170, y: pageH - top - 1 }, thickness: 0.5, color: INK });
    }
  }

  const pages = doc.getPages();
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const label = `Page ${i + 1} of ${pages.length}`;
      p.drawText(label, { x: LEFT + WIDTH - regular.widthOfTextAtSize(label, 8), y: pageH - 764, size: 8, font: regular, color: SOFT });
    });
  }
  return doc.save();
}
