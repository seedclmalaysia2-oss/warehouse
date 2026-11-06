// Server-only: reads an .xlsx into the row shape the CSG document parser takes.
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { C, SheetRows } from "./doc-parse";

/** A cell's plain value: text, number or date. Formulas give their result, rich text its words. */
function plain(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "result" in v) return (v as { result?: unknown }).result ?? null;
  if (typeof v === "object" && "richText" in v) return (v as { richText: { text: string }[] }).richText.map(t => t.text).join("");
  if (typeof v === "object" && "text" in v) return (v as { text?: unknown }).text ?? null;
  return null;
}

type StreamRow = { number: number; eachCell: (o: { includeEmpty: boolean }, f: (c: { value: unknown }, col: number) => void) => void };

/**
 * Read every sheet of an .xlsx as a stream. The ERP's print layout merges tens
 * of thousands of cells per file, and loading a whole workbook (which tracks
 * every merge) takes minutes; streaming skips that and reads in seconds. A
 * merged range's value sits in its top-left cell, which is all the parser needs.
 */
export async function readDocSheets(data: ArrayBuffer): Promise<SheetRows[]> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from([Buffer.from(data)]), {
    sharedStrings: "cache", hyperlinks: "ignore", styles: "ignore", worksheets: "emit", entries: "emit",
  });
  const sheets: SheetRows[] = [];
  for await (const ws of reader) {
    const sheet: SheetRows = { name: String((ws as { name?: string }).name ?? `Sheet ${sheets.length + 1}`), rows: [] };
    for await (const row of ws as unknown as AsyncIterable<StreamRow>) {
      const cells: C[] = [];
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const v = plain(cell.value);
        if (v === null || (typeof v === "string" && !v.trim())) return;
        cells.push({ col, value: typeof v === "string" ? v.trim() : v });
      });
      if (cells.length) sheet.rows.push({ r: row.number, cells });
    }
    sheets.push(sheet);
  }
  return sheets;
}
