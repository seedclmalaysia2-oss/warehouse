// The shape every report takes, shared by the on-screen view, the Excel
// download and the PDF download, so all three always show the same figures.
// Pure types and helpers: safe on server and client.

export type Align = "left" | "right" | "center";
/** int: whole number with separators; pct: 0..1 shown as a percentage; mono: codes such as CSG numbers. */
export type ColKind = "text" | "int" | "pct" | "date" | "mono";

export type Column = {
  key: string;
  label: string;
  kind?: ColKind;
  /** Relative width, used by the PDF and the Excel column widths. */
  width?: number;
};

export type Cell = string | number | null;
export type Row = Record<string, Cell> & { _tone?: "danger" | "warn" | "ok" | "group" | null };

export type ReportFilters = { owner: string; state: string; from: string; to: string };
export const EMPTY_FILTERS: ReportFilters = { owner: "", state: "", from: "", to: "" };
export type FilterKey = keyof ReportFilters;

export type ReportData = {
  id: string;
  title: string;
  /** One line under the title: what the report covers. */
  subtitle: string;
  columns: Column[];
  rows: Row[];
  totals?: Row;
  /** Headline figures, shown above the table. */
  summary: { label: string; value: string; tone?: "danger" | "warn" | "ok" }[];
  /** Plain-language notes printed under the table. */
  notes: string[];
  /** Landscape for wide tables. */
  landscape: boolean;
};

export type ReportMeta = {
  id: string;
  group: "ECP Consignment" | "Exchange Stock" | "Audit";
  title: string;
  description: string;
  /** Who reads it and when, to help pick the right one. */
  use: string;
  filters: FilterKey[];
};

export const align = (c: Column): Align => (c.kind === "int" || c.kind === "pct" ? "right" : c.kind === "mono" || c.kind === "date" ? "left" : "left");

export function fmtCell(c: Column, v: Cell): string {
  if (v === null || v === undefined || v === "") return "";
  if (c.kind === "int" && typeof v === "number") return v.toLocaleString("en-US");
  if (c.kind === "pct" && typeof v === "number") return `${Math.round(v * 100)}%`;
  return String(v);
}

export function filterQuery(f: ReportFilters): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
  return q.toString();
}

/** The filters as words, for the report header: "Salesman: Alan · State: Johor". */
export function filterLine(f: ReportFilters, used: FilterKey[]): string {
  const parts: string[] = [];
  if (used.includes("owner")) parts.push(`Salesman: ${f.owner || "All"}`);
  if (used.includes("state")) parts.push(`State: ${f.state || "All"}`);
  if (used.includes("from") || used.includes("to")) parts.push(`Period: ${f.from || "start"} to ${f.to || "today"}`);
  return parts.join("  ·  ");
}
