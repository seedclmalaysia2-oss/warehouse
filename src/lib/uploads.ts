// One list of everything uploaded to the Warehouse dashboard, newest first,
// gathered from each page's own import log. Pages call the (dash) layout's
// auth check first — Prisma bypasses row level security.
import { recentDocs } from "./consignment/doc-store";
import { recentImports as consignmentImports } from "./consignment/store";
import { recentImports as exchangeImports } from "./exchange/store";

export type UploadKind = "workbook" | "csg" | "issue" | "receive";

export type UploadEntry = {
  id: string;
  kind: UploadKind;
  /** ISO timestamp */
  at: string;
  file: string;
  detail: string;
  by: string | null;
  /** Set for CSG documents, which can be removed. */
  csgNo?: string;
};

const n = (v: number) => v.toLocaleString("en-US");

/** A source whose table is missing (SQL not applied yet) just contributes nothing. */
async function safe<T>(run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run();
  } catch {
    return [];
  }
}

export async function loadUploads(): Promise<UploadEntry[]> {
  const [workbooks, docs, exchange] = await Promise.all([
    safe(() => consignmentImports(100)),
    safe(() => recentDocs(500)),
    safe(() => exchangeImports(200)),
  ]);

  const out: UploadEntry[] = [
    ...workbooks.map<UploadEntry>(w => ({
      id: `w${w.id}`, kind: "workbook", at: w.uploadedAt.toISOString(), file: w.fileName || "Workbook",
      detail: `${n(w.units)} units, ${n(w.outlets)} outlets, ${n(w.lines)} CSG lines`, by: w.uploadedBy,
    })),
    ...docs.map<UploadEntry>(d => ({
      id: `c${d.csgNo}`, kind: "csg", at: d.uploadedAt.toISOString(), file: d.fileName || d.csgNo,
      detail: `${d.csgNo}, ${n(d.lineTotal)} boxes${d.toCounter ? `, ${d.toCounter}` : ""}`, by: d.uploadedBy, csgNo: d.csgNo,
    })),
    ...exchange.map<UploadEntry>(e => ({
      id: `e${e.id}`, kind: e.kind === "receive" ? "receive" : "issue", at: e.uploadedAt.toISOString(), file: e.fileName || "Listing",
      detail: `${n(e.rowsAdded)} new, ${n(e.rowsUpdated)} updated`, by: e.uploadedBy,
    })),
  ];
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
