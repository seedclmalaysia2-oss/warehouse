// ECP Consignment data access. Pages and routes call guardDept()/the (dash)
// layout first — Prisma bypasses row level security.
import { prisma } from "@/lib/db";
import { docKey, type Line, type OutletRef, type Tag } from "./analyze";
import type { ParsedDoc } from "./doc-parse";
import { normalizeProduct, type ParsedConsignment } from "./parse";
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

/** Marks lines added from an outlet's own upload rather than read from the workbook. */
export const OUTLET_UPLOAD_SHEET = "Outlet upload";

/**
 * Put CSGs the workbook does not list at this outlet on the outlet's page now,
 * one line per product on the document. They are added to the current snapshot,
 * so they show in every total at once; the next workbook upload replaces the
 * snapshot, so the workbook needs the same CSGs added by hand. Re-sending a CSG
 * replaces the line it added before. Throws if no workbook has been uploaded.
 */
export async function addOutletLines(
  outlet: { outlet: string; owner: string; state: string; town: string },
  docs: ParsedDoc[],
) {
  const [info] = await recentImports(1);
  if (!info) throw new Error("No workbook has been uploaded yet.");
  const importId = BigInt(info.id);

  const data = docs.flatMap(d => {
    const byProduct = new Map<string, { product: string; family: string; qty: number }>();
    for (const l of d.lines) {
      const p = normalizeProduct(l.description);
      const cur = byProduct.get(p.product);
      byProduct.set(p.product, { ...p, qty: (cur?.qty ?? 0) + l.qty });
    }
    return [...byProduct.values()].filter(p => p.qty > 0).map(p => ({
      importId, sheet: OUTLET_UPLOAD_SHEET, rowNo: 0, owner: outlet.owner, state: outlet.state, town: outlet.town, outlet: outlet.outlet,
      product: p.product, family: p.family, csgNo: d.csgNo, csgDate: d.docDate ? new Date(`${d.docDate}T00:00:00Z`) : null,
      qty: p.qty, needsRefresh: false, tag: null as string | null,
    }));
  });

  await prisma.$transaction(async tx => {
    await tx.consignmentLine.deleteMany({ where: { importId, sheet: OUTLET_UPLOAD_SHEET, outlet: outlet.outlet, csgNo: { in: docs.map(d => d.csgNo) } } });
    if (data.length) await tx.consignmentLine.createMany({ data });
    // Keep the import's own totals in step with its lines.
    const [count, sum] = await Promise.all([
      tx.consignmentLine.count({ where: { importId } }),
      tx.consignmentLine.aggregate({ where: { importId }, _sum: { qty: true } }),
    ]);
    await tx.consignmentImport.update({ where: { id: importId }, data: { lines: count, units: sum._sum.qty ?? 0 } });
  }, { timeout: 30_000 });
  return { lines: data.length, units: data.reduce((s, l) => s + l.qty, 0) };
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
