// Excel and PDF versions of a report. Both are built from the same ReportData
// the screen shows, so the three never disagree. Server only.
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { align, fmtCell, type Column, type ReportData, type Row } from "./types";

export const COMPANY = "SEED Contact Lens (M) Sdn. Bhd.";

export type ExportHead = { filters: string; generatedAt: string; by: string };

const TONE_FILL: Record<string, string> = { danger: "FFFDECEA", warn: "FFFFF4DB", ok: "FFE9F6EE", group: "FFEEF2FF" };
const NAVY_ARGB = "FF1E2761";

export function fileStem(r: ReportData, generatedISO: string) {
  return `${r.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}_${generatedISO}`;
}

export async function reportXlsx(r: ReportData, head: ExportHead): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY;
  wb.created = new Date();
  const ws = wb.addWorksheet(r.title.slice(0, 31), {
    pageSetup: { paperSize: 9, orientation: r.landscape ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L${COMPANY}&C${r.title}&RPage &P of &N` },
  });
  const n = r.columns.length;
  const line = (text: string, size: number, bold = false, color = "FF141A3D") => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, n);
    row.getCell(1).font = { size, bold, color: { argb: color }, name: "Calibri" };
    return row;
  };
  line(COMPANY, 10, true, "FF4353A6");
  line(r.title, 16, true);
  line(r.subtitle, 10, false, "FF4B5563");
  if (head.filters) line(head.filters, 10, false, "FF4B5563");
  line(`Generated ${head.generatedAt} by ${head.by}`, 9, false, "FF6B7280");
  if (r.summary.length) line(r.summary.map(s => `${s.label}: ${s.value}`).join("    |    "), 10, true);
  ws.addRow([]);

  const headerRow = ws.addRow(r.columns.map(c => c.label));
  headerRow.height = 22;
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  r.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(8, Math.round((c.width ?? 10) * 1.35));
    if (c.kind === "int") col.numFmt = "#,##0";
    if (c.kind === "pct") col.numFmt = "0%";
    if (c.kind === "date") col.numFmt = "dd mmm yyyy";
    headerRow.getCell(i + 1).alignment = { vertical: "middle", wrapText: true, horizontal: align(c) };
  });
  ws.views = [{ state: "frozen", ySplit: headerRow.number }];
  const first = headerRow.number;

  const value = (c: Column, v: Row[string]) =>
    c.kind === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : v ?? null;
  for (const row of r.rows) {
    const x = ws.addRow(r.columns.map(c => value(c, row[c.key])));
    if (row._tone) x.eachCell({ includeEmpty: true }, cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TONE_FILL[row._tone!] } }; });
    if (row._tone === "group") x.font = { bold: true };
  }
  if (r.rows.length) ws.autoFilter = { from: { row: first, column: 1 }, to: { row: first + r.rows.length, column: n } };

  if (r.totals) {
    const t = ws.addRow(r.columns.map(c => value(c, r.totals![c.key])));
    t.eachCell({ includeEmpty: true }, cell => {
      cell.font = { bold: true };
      cell.border = { top: { style: "medium", color: { argb: NAVY_ARGB } } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7FF" } };
    });
  }
  if (r.notes.length) {
    ws.addRow([]);
    for (const note of r.notes) line(note, 9, false, "FF6B7280");
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- PDF ----------

const NAVY = rgb(0x1e / 255, 0x27 / 255, 0x61 / 255);
const BLUE = rgb(0x43 / 255, 0x53 / 255, 0xa6 / 255);
const INK = rgb(0x14 / 255, 0x1a / 255, 0x3d / 255);
const MUTED = rgb(0x6b / 255, 0x72 / 255, 0x80 / 255);
const RULE = rgb(0xca / 255, 0xdc / 255, 0xfc / 255);
const ZEBRA = rgb(0xf4 / 255, 0xf7 / 255, 0xff / 255);
const WHITE = rgb(1, 1, 1);
const TONE_RGB: Record<string, ReturnType<typeof rgb>> = {
  danger: rgb(0xfd / 255, 0xec / 255, 0xea / 255), warn: rgb(1, 0xf4 / 255, 0xdb / 255),
  ok: rgb(0xe9 / 255, 0xf6 / 255, 0xee / 255), group: rgb(0xee / 255, 0xf2 / 255, 1),
};
const TONE_INK: Record<string, ReturnType<typeof rgb>> = { danger: rgb(0xb4 / 255, 0x23 / 255, 0x18 / 255), warn: rgb(0xb4 / 255, 0x5a / 255, 0x06 / 255), ok: rgb(0x2c / 255, 0x8a / 255, 0x4a / 255) };

export async function reportPdf(r: ReportData, head: ExportHead): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(r.title);
  doc.setAuthor(COMPANY);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const known = new Set(reg.getCharacterSet());
  const clean = (s: string) => [...s.replace(/\s+/g, " ").trim()].map(c => (known.has(c.codePointAt(0)!) ? c : c === "·" ? "-" : "?")).join("");

  const [W, H] = r.landscape ? [841.89, 595.28] : [595.28, 841.89];
  const M = 32;
  const usable = W - M * 2;
  const total = r.columns.reduce((s, c) => s + (c.width ?? 10), 0);
  const widths = r.columns.map(c => ((c.width ?? 10) / total) * usable);
  const SIZE = 7.8;
  const ROW_H = 15;
  const HEAD_H = 20;
  const FOOT = 30;

  const fit = (s: string, font: PDFFont, size: number, max: number) => {
    let t = clean(s);
    if (font.widthOfTextAtSize(t, size) <= max) return t;
    while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > max) t = t.slice(0, -1);
    return `${t}...`;
  };
  let page!: PDFPage;
  let y = 0;
  const text = (s: string, x: number, baseline: number, size: number, font = reg, color = INK) =>
    page.drawText(clean(s), { x, y: baseline, size, font, color });

  const cells = (row: Row, font: PDFFont, color: (c: Column) => ReturnType<typeof rgb>) => {
    let x = M;
    r.columns.forEach((c, i) => {
      const s = fit(fmtCell(c, row[c.key] ?? null), font, SIZE, widths[i] - 8);
      const w = font.widthOfTextAtSize(s, SIZE);
      const a = align(c);
      const dx = a === "right" ? widths[i] - 4 - w : a === "center" ? (widths[i] - w) / 2 : 4;
      page.drawText(s, { x: x + dx, y: y - ROW_H + 4.6, size: SIZE, font, color: color(c) });
      x += widths[i];
    });
  };

  const tableHead = () => {
    page.drawRectangle({ x: M, y: y - HEAD_H, width: usable, height: HEAD_H, color: NAVY });
    let x = M;
    r.columns.forEach((c, i) => {
      const s = fit(c.label, bold, SIZE, widths[i] - 8);
      const w = bold.widthOfTextAtSize(s, SIZE);
      const a = align(c);
      const dx = a === "right" ? widths[i] - 4 - w : 4;
      page.drawText(s, { x: x + dx, y: y - HEAD_H + 7, size: SIZE, font: bold, color: WHITE });
      x += widths[i];
    });
    y -= HEAD_H;
  };

  const newPage = (first: boolean) => {
    page = doc.addPage([W, H]);
    y = H - M;
    if (first) {
      page.drawRectangle({ x: M, y: y - 3, width: 36, height: 3, color: rgb(0xf9 / 255, 0x61 / 255, 0x67 / 255) });
      y -= 16;
      text(COMPANY.toUpperCase(), M, y, 8, bold, BLUE);
      text(`Generated ${head.generatedAt}`, W - M - reg.widthOfTextAtSize(clean(`Generated ${head.generatedAt}`), 8), y, 8, reg, MUTED);
      y -= 22;
      text(r.title, M, y, 18, bold, INK);
      y -= 14;
      text(r.subtitle, M, y, 9, reg, MUTED);
      if (head.filters) { y -= 12; text(head.filters, M, y, 9, reg, BLUE); }
      y -= 14;
      if (r.summary.length) {
        const bw = Math.min(170, (usable - (r.summary.length - 1) * 8) / r.summary.length);
        r.summary.forEach((s, i) => {
          const x = M + i * (bw + 8);
          page.drawRectangle({ x, y: y - 38, width: bw, height: 38, borderColor: RULE, borderWidth: 0.8, color: WHITE });
          page.drawText(fit(s.value, bold, 13, bw - 16), { x: x + 8, y: y - 18, size: 13, font: bold, color: s.tone ? TONE_INK[s.tone] : INK });
          page.drawText(fit(s.label, reg, 7.5, bw - 16), { x: x + 8, y: y - 31, size: 7.5, font: reg, color: MUTED });
        });
        y -= 50;
      }
    } else {
      y -= 10;
      text(`${r.title} (continued)`, M, y, 9, bold, INK);
      y -= 10;
    }
    tableHead();
  };

  newPage(true);
  if (!r.rows.length) {
    y -= 22;
    text("Nothing to report for these filters.", M + 4, y, 10, reg, MUTED);
  }
  r.rows.forEach((row, i) => {
    if (y - ROW_H < M + FOOT) newPage(false);
    const fill = row._tone ? TONE_RGB[row._tone] : i % 2 ? ZEBRA : undefined;
    if (fill) page.drawRectangle({ x: M, y: y - ROW_H, width: usable, height: ROW_H, color: fill });
    cells(row, row._tone === "group" ? bold : reg, () => INK);
    page.drawLine({ start: { x: M, y: y - ROW_H }, end: { x: M + usable, y: y - ROW_H }, thickness: 0.4, color: RULE });
    y -= ROW_H;
  });
  if (r.totals) {
    if (y - ROW_H < M + FOOT) newPage(false);
    page.drawRectangle({ x: M, y: y - ROW_H - 1, width: usable, height: ROW_H + 1, color: ZEBRA });
    page.drawLine({ start: { x: M, y }, end: { x: M + usable, y }, thickness: 1.2, color: NAVY });
    cells(r.totals, bold, () => INK);
    y -= ROW_H + 1;
  }
  if (r.notes.length) {
    y -= 8;
    for (const n of r.notes) {
      if (y - 12 < M + FOOT) newPage(false);
      y -= 11;
      text(`• ${n}`.replace("•", "-"), M, y, 7.5, reg, MUTED);
    }
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawLine({ start: { x: M, y: M + 12 }, end: { x: W - M, y: M + 12 }, thickness: 0.5, color: RULE });
    p.drawText(clean(`${COMPANY}  -  ${r.title}  -  prepared by ${head.by}`), { x: M, y: M, size: 7, font: reg, color: MUTED });
    p.drawText(label, { x: W - M - reg.widthOfTextAtSize(label, 7), y: M, size: 7, font: reg, color: MUTED });
  });
  return doc.save();
}
