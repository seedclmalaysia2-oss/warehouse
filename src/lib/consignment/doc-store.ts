// CSG document data access. Pages and routes call guardDept()/the (dash)
// layout first — Prisma bypasses row level security.
import { prisma } from "@/lib/db";
import type { ParsedDoc } from "./doc-parse";

const day = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);

/** Save parsed documents. A CSG that is already stored is replaced, so re-uploading is safe. */
export async function saveDocs(docs: ParsedDoc[], fileName: string, by: string) {
  let replaced = 0;
  await prisma.$transaction(async tx => {
    for (const d of docs) {
      const gone = await tx.consignmentDoc.deleteMany({ where: { csgNo: d.csgNo } });
      replaced += gone.count;
      await tx.consignmentDoc.create({
        data: {
          csgNo: d.csgNo, docDate: day(d.docDate), toCounter: d.toCounter, fromCounter: d.fromCounter,
          salesperson: d.salesperson, createdBy: d.createdBy, printedTotal: d.printedTotal,
          lineTotal: d.lines.reduce((s, l) => s + l.qty, 0), remark: d.remark, fileName, uploadedBy: by,
          lines: { create: d.lines.map(l => ({ ...l })) },
        },
      });
    }
  }, { timeout: 30_000 });
  return { saved: docs.length, replaced };
}

export type DocView = {
  csgNo: string;
  docDate: string | null;
  toCounter: string;
  salesperson: string;
  createdBy: string;
  printedTotal: number | null;
  lineTotal: number;
  remark: string;
  lines: { itemNo: number; stockId: string; description: string; power: string | null; extra: string | null; expire: string | null; qty: number }[];
};

export async function loadDoc(csgNo: string): Promise<DocView | null> {
  const d = await prisma.consignmentDoc.findUnique({ where: { csgNo }, include: { lines: { orderBy: { itemNo: "asc" } } } });
  if (!d) return null;
  return {
    csgNo: d.csgNo, docDate: d.docDate ? d.docDate.toISOString().slice(0, 10) : null, toCounter: d.toCounter,
    salesperson: d.salesperson, createdBy: d.createdBy, printedTotal: d.printedTotal, lineTotal: d.lineTotal, remark: d.remark,
    lines: d.lines.map(l => ({
      itemNo: l.itemNo, stockId: l.stockId, description: l.description, power: l.power, extra: l.extra, expire: l.expire, qty: l.qty,
    })),
  };
}

/** CSG numbers that have details. Never throws: before 0005 is applied the table is missing and the page must still load. */
export async function loadDocNumbers(): Promise<string[]> {
  try {
    const rows = await prisma.consignmentDoc.findMany({ select: { csgNo: true } });
    return rows.map(r => r.csgNo);
  } catch {
    return [];
  }
}

export async function recentDocs(take = 8) {
  const rows = await prisma.consignmentDoc.findMany({ orderBy: { uploadedAt: "desc" }, take });
  return rows.map(r => ({ csgNo: r.csgNo, toCounter: r.toCounter, lineTotal: r.lineTotal, uploadedAt: r.uploadedAt, uploadedBy: r.uploadedBy }));
}

export async function docCount(): Promise<number> {
  return prisma.consignmentDoc.count();
}
