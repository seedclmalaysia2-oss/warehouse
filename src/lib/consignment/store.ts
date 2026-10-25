// ECP Consignment data access. Pages and routes call guardDept()/the (dash)
// layout first — Prisma bypasses row level security.
import { prisma } from "@/lib/db";
import type { Line, OutletRef, Tag } from "./analyze";
import type { ParsedConsignment } from "./parse";

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

export type Snapshot = { info: ImportInfo; lines: Line[]; outlets: OutletRef[] };

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
    lines: lines.map(l => ({
      outlet: l.outlet, owner: l.owner, state: l.state, town: l.town, product: l.product, family: l.family,
      csgNo: l.csgNo, csgDate: day(l.csgDate), qty: l.qty, needsRefresh: l.needsRefresh, tag: l.tag as Tag | null,
    })),
    outlets: outlets.map(o => ({ outlet: o.outlet, owner: o.owner, state: o.state, town: o.town })),
  };
}
