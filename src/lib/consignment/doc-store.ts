// CSG document data access. Pages and routes call guardDept()/the (dash)
// layout first — Prisma bypasses row level security.
import { prisma } from "@/lib/db";
import { docKey } from "./analyze";
import type { ParsedDoc } from "./doc-parse";

const day = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);

export type SaveStatus = "new" | "updated" | "unchanged";
export type SaveResult = { csgNo: string; status: SaveStatus; /** The file an updated CSG was read from before. */ was?: string };

// What a document says, so a copy can be told from a changed one.
const lineSig = (l: { itemNo: number; stockId: string; description: string; power: string | null; extra: string | null; expire: string | null; mdaNo: string | null; qty: number; uom: string }) =>
  [l.itemNo, l.stockId, l.description, l.power ?? "", l.extra ?? "", l.expire ?? "", l.mdaNo ?? "", l.qty, l.uom].join("|");
const docSig = (d: { docDate: string | null; toCounter: string; remark: string; lines: Parameters<typeof lineSig>[0][] }) =>
  [d.docDate ?? "", d.toCounter, d.remark, ...d.lines.map(lineSig).sort()].join("\n");

/**
 * Save parsed documents, one stored copy per CSG number. A CSG that is already
 * stored (matched on its normalised number, so "CSG 1234" and "CSG1234" are one)
 * is replaced, so re-uploading is safe. With `keepSame`, a copy that says exactly
 * what the stored one does is left alone.
 */
export async function saveDocs(docs: ParsedDoc[], fileName: string, by: string, opts: { keepSame?: boolean } = {}) {
  const results: SaveResult[] = [];
  await prisma.$transaction(tx => writeDocs(tx, docs, fileName, by, opts, results), { timeout: 60_000 });
  return summarise(results);
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** The body of saveDocs, on a transaction the caller owns (so a test can roll it back). */
export async function writeDocs(tx: Tx, docs: ParsedDoc[], fileName: string, by: string, opts: { keepSame?: boolean }, results: SaveResult[]) {
  // One copy per CSG within the batch too: the last one given wins.
  const unique = new Map<string, ParsedDoc>();
  for (const d of docs) unique.set(docKey(d.csgNo), d);
  const batch = [...unique.entries()];
  const inBatch = new Set(batch.map(([k]) => k));
  const stored = (await tx.consignmentDoc.findMany({
    select: { id: true, csgNo: true, fileName: true, docDate: true, toCounter: true, remark: true },
  })).filter(s => inBatch.has(docKey(s.csgNo)));
  const storedLines = opts.keepSame && stored.length
    ? await tx.consignmentDocLine.findMany({ where: { docId: { in: stored.map(s => s.id) } } })
    : [];
  const have = new Map<string, ((typeof stored)[number] & { lines: typeof storedLines })[]>();
  for (const s of stored) {
    const k = docKey(s.csgNo);
    have.set(k, [...(have.get(k) ?? []), { ...s, lines: storedLines.filter(l => l.docId === s.id) }]);
  }

  const fresh: [string, ParsedDoc][] = [];
  const drop: bigint[] = [];
  for (const [k, d] of batch) {
    const old = have.get(k) ?? [];
    if (opts.keepSame && old.length === 1 && old[0].csgNo === d.csgNo
      && docSig({ ...old[0], docDate: old[0].docDate ? old[0].docDate.toISOString().slice(0, 10) : null }) === docSig(d)) {
      results.push({ csgNo: d.csgNo, status: "unchanged" });
      continue;
    }
    drop.push(...old.map(o => o.id));
    results.push(old.length ? { csgNo: d.csgNo, status: "updated", was: old[0].fileName } : { csgNo: d.csgNo, status: "new" });
    fresh.push([k, d]);
  }

  if (drop.length) await tx.consignmentDoc.deleteMany({ where: { id: { in: drop } } });
  if (!fresh.length) return;
  const made = await tx.consignmentDoc.createManyAndReturn({
    data: fresh.map(([, d]) => ({
      csgNo: d.csgNo, docDate: day(d.docDate), toCounter: d.toCounter, fromCounter: d.fromCounter,
      salesperson: d.salesperson, createdBy: d.createdBy, printedTotal: d.printedTotal,
      lineTotal: d.lines.reduce((s, l) => s + l.qty, 0), remark: d.remark, fileName, uploadedBy: by,
    })),
    select: { id: true, csgNo: true },
  });
  const idOf = new Map(made.map(m => [m.csgNo, m.id]));
  const rows = fresh.flatMap(([, d]) => d.lines.map(l => ({ ...l, docId: idOf.get(d.csgNo)! })));
  for (let i = 0; i < rows.length; i += 2000) await tx.consignmentDocLine.createMany({ data: rows.slice(i, i + 2000) });
}

export function summarise(results: SaveResult[]) {
  return {
    saved: results.filter(r => r.status !== "unchanged").length,
    replaced: results.filter(r => r.status === "updated").length,
    results,
  };
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

/** When and by whom these CSGs' documents were uploaded. Same never-throws rule as loadDocNumbers. */
export async function loadDocMeta(csgNos: string[]) {
  try {
    const rows = await prisma.consignmentDoc.findMany({
      where: { csgNo: { in: csgNos } },
      select: { csgNo: true, fileName: true, uploadedAt: true, uploadedBy: true, lineTotal: true },
    });
    return rows.map(r => ({ csgNo: r.csgNo, fileName: r.fileName, uploadedAt: r.uploadedAt.toISOString(), uploadedBy: r.uploadedBy, lineTotal: r.lineTotal }));
  } catch {
    return [];
  }
}

export async function recentDocs(take = 300) {
  const rows = await prisma.consignmentDoc.findMany({ orderBy: { uploadedAt: "desc" }, take });
  return rows.map(r => ({ csgNo: r.csgNo, toCounter: r.toCounter, lineTotal: r.lineTotal, fileName: r.fileName, uploadedAt: r.uploadedAt, uploadedBy: r.uploadedBy }));
}

/** Remove one CSG's details. The workbook figures are untouched. */
export async function deleteDoc(csgNo: string): Promise<boolean> {
  const gone = await prisma.consignmentDoc.deleteMany({ where: { csgNo } });
  return gone.count > 0;
}

export async function docCount(): Promise<number> {
  return prisma.consignmentDoc.count();
}
