// ECP Consignment data access. Pages and routes call guardDept()/the (dash)
// layout first — Prisma bypasses row level security.
import { prisma } from "@/lib/db";
import { docKey, type Line, type OutletRef, type Tag } from "./analyze";
import type { ParsedConsignment } from "./parse";
import { loadReturnSummary } from "./return-store";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Replace the snapshot with a freshly parsed workbook. The workbook is the
 * source of truth and is edited in place, so each upload supersedes the last:
 * re-uploading is always safe and never double counts.
 */
export async function importConsignment(parsed: ParsedConsignment, fileName: string, by: string) {
  const units = parsed.lines.reduce((s, l) => s + l.qty, 0);
  return prisma.$transaction(async tx => {
    const imp = await tx.consignmentImport.create({
      data: {
        fileName, outlets: parsed.outlets.length, lines: parsed.lines.length, units,
        sheets: parsed.sheets.map(s => s.name), ignoredSheets: parsed.ignoredSheets,
        warnings: parsed.warnings, uploadedBy: by,
      },
    });
    await tx.consignmentOutlet.createMany({
      data: parsed.outlets.map(o => ({
        importId: imp.id, sheet: o.sheet, rowNo: o.row, owner: o.salesperson, state: o.state, town: o.town, outlet: o.outlet,
      })),
    });
    await tx.consignmentLine.createMany({
      data: parsed.lines.map(l => ({
        importId: imp.id, sheet: l.sheet, rowNo: l.row, owner: l.salesperson, state: l.state, town: l.town, outlet: l.outlet,
        product: l.product, family: l.family, csgNo: l.csgNo, csgDate: l.csgDate ? new Date(`${l.csgDate}T00:00:00Z`) : null,
        qty: l.qty, needsRefresh: l.needsRefresh, tag: l.tag,
      })),
    });
    // Keep the import log, drop the superseded snapshot.
    await tx.consignmentLine.deleteMany({ where: { importId: { not: imp.id } } });
    await tx.consignmentOutlet.deleteMany({ where: { importId: { not: imp.id } } });
    return { outlets: parsed.outlets.length, lines: parsed.lines.length, units };
  }, { timeout: 30_000 });
}

export type ImportInfo = {
  id: number;
  fileName: string;
  outlets: number;
  lines: number;
  units: number;
  sheets: string[];
  ignoredSheets: string[];
  warnings: string[];
  uploadedAt: Date;
  uploadedBy: string | null;
};

export async function recentImports(take = 10): Promise<ImportInfo[]> {
  const rows = await prisma.consignmentImport.findMany({ orderBy: { uploadedAt: "desc" }, take });
  return rows.map(r => ({ ...r, id: Number(r.id) }));
}

/**
 * Which outlet each CSG number is out at, according to the current workbook.
 * Keyed by the normalised number. A number can sit at more than one outlet
 * (the workbook lists it under each), so the value is a list.
 */
export async function loadCsgOutlets(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  try {
    const [info] = await recentImports(1);
    if (!info) return out;
    const rows = await prisma.consignmentLine.findMany({
      where: { importId: BigInt(info.id), csgNo: { not: null } },
      select: { outlet: true, csgNo: true },
      distinct: ["outlet", "csgNo"],
    });
    for (const r of rows) {
      const k = docKey(r.csgNo!);
      const list = out.get(k) ?? [];
      if (!list.includes(r.outlet)) list.push(r.outlet);
      out.set(k, list);
    }
  } catch {
    // Tables missing: every CSG will simply report as not in the workbook.
  }
  return out;
}

export type Snapshot = { info: ImportInfo; lines: Line[]; outlets: OutletRef[] };

/**
 * Bring each CSG's balance in line with the CSRs uploaded against it. The
 * workbook is kept by hand and may already show a return, so a CSG's quantity
 * is only ever lowered to what its document and CSRs leave (CSG total less the
 * CSRs), never raised, and a return is never taken off twice. A CSG that the
 * workbook splits over several lines at one outlet keeps its figures, because
 * the document total cannot be shared out between them; it still shows its
 * latest CSR code. Never throws: without the tables the lines are left as they are.
 */
async function withReturns(lines: Line[]): Promise<Line[]> {
  try {
    const summary = await loadReturnSummary();
    if (!summary.size) return lines;
    const docs = await prisma.consignmentDoc.findMany({ select: { csgNo: true, lineTotal: true } });
    const given = new Map(docs.map(d => [docKey(d.csgNo), d.lineTotal]));
    const perOutlet = new Map<string, number>();
    for (const l of lines) if (l.csgNo) { const k = `${l.outlet}|${docKey(l.csgNo)}`; perOutlet.set(k, (perOutlet.get(k) ?? 0) + 1); }

    return lines.flatMap(l => {
      const key = l.csgNo ? docKey(l.csgNo) : null;
      const ret = key ? summary.get(key) : undefined;
      if (!key || !ret) return [l];
      const total = given.get(key);
      const single = perOutlet.get(`${l.outlet}|${key}`) === 1;
      const left = total === undefined || !single ? l.qty : Math.min(l.qty, total - ret.boxes);
      // Everything came back: nothing is left at the outlet under this CSG.
      return left > 0 ? [{ ...l, qty: left, latestCode: ret.latestCode }] : [];
    });
  } catch {
    return lines;
  }
}

/** The current snapshot, or null before the first upload. Throws if the tables don't exist (0004 not applied). */
export async function loadSnapshot(): Promise<Snapshot | null> {
  const [info] = await recentImports(1);
  if (!info) return null;
  const [lines, outlets] = await Promise.all([
    prisma.consignmentLine.findMany({ where: { importId: BigInt(info.id) }, orderBy: [{ outlet: "asc" }, { csgDate: "asc" }] }),
    prisma.consignmentOutlet.findMany({ where: { importId: BigInt(info.id) } }),
  ]);
  return {
    info,
    lines: await withReturns(lines.map(l => ({
      outlet: l.outlet, owner: l.owner, state: l.state, town: l.town, product: l.product, family: l.family,
      csgNo: l.csgNo, csgDate: day(l.csgDate), qty: l.qty, needsRefresh: l.needsRefresh, tag: l.tag as Tag | null,
    }))),
    outlets: outlets.map(o => ({ outlet: o.outlet, owner: o.owner, state: o.state, town: o.town })),
  };
}
