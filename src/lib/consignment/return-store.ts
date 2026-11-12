// CSR (consignment return) data access. Pages and routes call guardDept() / the
// (dash) layout first, because Prisma bypasses row level security.
import { prisma } from "@/lib/db";
import { docKey } from "./analyze";
import type { ParsedDoc } from "./doc-parse";
import { parseReturnCode, type Box } from "./return-apply";

const day = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);

export type StoredReturn = {
  code: string;
  seq: number;
  docDate: string | null;
  fromOutlet: string;
  lineTotal: number;
  lines: Box[];
};

/** Save CSRs. A code that is already stored is replaced, so re-uploading is safe. */
export async function saveReturns(docs: ParsedDoc[], fileName: string, by: string) {
  let replaced = 0;
  await prisma.$transaction(async tx => {
    for (const d of docs) {
      const p = parseReturnCode(d.csgNo);
      if (!p) continue;
      const gone = await tx.consignmentReturn.deleteMany({ where: { code: d.csgNo } });
      replaced += gone.count;
      await tx.consignmentReturn.create({
        data: {
          kind: "CSR", code: d.csgNo, csgKey: p.csgKey, docDate: day(d.docDate), fromOutlet: d.fromCounter, toCounter: d.toCounter,
          createdBy: d.createdBy, remark: d.remark, lineTotal: d.lines.reduce((s, l) => s + l.qty, 0), fileName, uploadedBy: by,
          lines: {
            create: d.lines.map(l => ({
              itemNo: l.itemNo, stockId: l.stockId, description: l.description, power: l.power, extra: l.extra,
              expire: l.expire, mdaNo: l.mdaNo, qty: l.qty, uom: l.uom,
            })),
          },
        },
      });
    }
  }, { timeout: 60_000 });
  return { saved: docs.length, replaced };
}

/** The stored CSG documents, by normalised number, with their boxes (for checking a CSR against them). */
export async function loadCsgBoxes(csgKeys: string[]): Promise<Map<string, Box[]>> {
  const want = new Set(csgKeys);
  const rows = await prisma.consignmentDoc.findMany({ select: { csgNo: true, lines: true } });
  const out = new Map<string, Box[]>();
  for (const r of rows) {
    const k = docKey(r.csgNo);
    if (!want.has(k)) continue;
    out.set(k, r.lines.map(l => ({ stockId: l.stockId, power: l.power, extra: l.extra, expire: l.expire, mdaNo: l.mdaNo, qty: l.qty })));
  }
  return out;
}

/** The CSG keys that have a CSA on record. Empty until CSAs can be uploaded. */
export async function csaKeys(): Promise<Set<string>> {
  try {
    const rows = await prisma.consignmentReturn.findMany({ where: { kind: "CSA" }, select: { csgKey: true } });
    return new Set(rows.map(r => r.csgKey));
  } catch {
    return new Set();
  }
}

/** Every stored CSR against one CSG (by its normalised number), oldest first. Never throws. */
export async function loadReturnsFor(csgKey: string): Promise<StoredReturn[]> {
  try {
    const rows = await prisma.consignmentReturn.findMany({
      where: { kind: "CSR", csgKey }, include: { lines: { orderBy: { itemNo: "asc" } } },
    });
    return rows
      .map(r => ({
        code: r.code, seq: parseReturnCode(r.code)?.seq ?? 0, docDate: r.docDate ? r.docDate.toISOString().slice(0, 10) : null,
        fromOutlet: r.fromOutlet, lineTotal: r.lineTotal,
        lines: r.lines.map(l => ({ stockId: l.stockId, power: l.power, extra: l.extra, expire: l.expire, mdaNo: l.mdaNo, qty: l.qty })),
      }))
      .sort((a, b) => a.seq - b.seq || (a.docDate ?? "").localeCompare(b.docDate ?? ""));
  } catch {
    return [];
  }
}

export type ReturnSummary = { boxes: number; count: number; latestCode: string };

/** Returned boxes and the latest CSR code per CSG. Never throws: before 0007 the table is missing and the page must still load. */
export async function loadReturnSummary(): Promise<Map<string, ReturnSummary>> {
  const out = new Map<string, ReturnSummary>();
  try {
    const rows = await prisma.consignmentReturn.findMany({
      where: { kind: "CSR" }, select: { code: true, csgKey: true, lineTotal: true, docDate: true },
    });
    const best = new Map<string, { seq: number; date: string }>();
    for (const r of rows) {
      const seq = parseReturnCode(r.code)?.seq ?? 0;
      const date = r.docDate ? r.docDate.toISOString().slice(0, 10) : "";
      const cur = out.get(r.csgKey);
      const b = best.get(r.csgKey);
      const newer = !b || seq > b.seq || (seq === b.seq && date > b.date);
      out.set(r.csgKey, { boxes: (cur?.boxes ?? 0) + r.lineTotal, count: (cur?.count ?? 0) + 1, latestCode: newer || !cur ? r.code : cur.latestCode });
      if (newer) best.set(r.csgKey, { seq, date });
    }
  } catch {
    // Not applied yet: no returns.
  }
  return out;
}

/** The CSR codes stored against each of these CSGs (normalised numbers), oldest first. Never throws. */
export async function loadReturnCodes(csgKeys: string[]): Promise<Record<string, string[]>> {
  try {
    const rows = await prisma.consignmentReturn.findMany({ where: { kind: "CSR", csgKey: { in: csgKeys } }, select: { code: true, csgKey: true } });
    const out: Record<string, { code: string; seq: number }[]> = {};
    for (const r of rows) (out[r.csgKey] ??= []).push({ code: r.code, seq: parseReturnCode(r.code)?.seq ?? 0 });
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.sort((a, b) => a.seq - b.seq).map(x => x.code)]));
  } catch {
    return {};
  }
}

export async function recentReturns(take = 300) {
  const rows = await prisma.consignmentReturn.findMany({ where: { kind: "CSR" }, orderBy: { uploadedAt: "desc" }, take });
  return rows.map(r => ({
    code: r.code, fromOutlet: r.fromOutlet, lineTotal: r.lineTotal, fileName: r.fileName, uploadedAt: r.uploadedAt, uploadedBy: r.uploadedBy,
  }));
}

/** Remove one CSR; its boxes go back onto the CSG. */
export async function deleteReturn(code: string): Promise<boolean> {
  const gone = await prisma.consignmentReturn.deleteMany({ where: { code } });
  return gone.count > 0;
}
