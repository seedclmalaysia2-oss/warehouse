// Reads the first sheet of an xlsx into the plain grid parse.ts expects.
import ExcelJS from "exceljs";
import type { Cell, Grid } from "./parse";

export async function readGrid(data: ArrayBuffer | Buffer): Promise<Grid> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const grid: Grid = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const out: Cell[] = [];
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      // A merged range repeats its top-left value in every cell; keep only the top-left.
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const v = cell.value;
      let value: Cell = null;
      if (v === null || v === undefined) value = null;
      else if (typeof v === "string" || typeof v === "number" || v instanceof Date) value = v;
      else if (typeof v === "object" && "result" in v) value = (v.result as Cell) ?? null; // formula
      else if (typeof v === "object" && "richText" in v) value = v.richText.map(t => t.text).join("");
      else value = String(v);
      out[c - 1] = value;
    });
    grid[r - 1] = out;
  });
  return Array.from(grid, row => row ?? []);
}
