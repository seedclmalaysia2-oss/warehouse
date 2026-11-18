// Deleted CSG / CSR files, kept so a mistake can be undone. Every delete on the
// outlet page and the Upload files page goes through here: the rows are copied
// into consignment_trash (SQL 0008) in the same transaction that deletes them,
// and Restore writes them back. Pages and routes call guardDept() first —
// Prisma bypasses row level security.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { docKey, outletKey } from "./analyze";
import { OUTLET_UPLOAD_SHEET, loadCsgOutlets, recentImports, syncImportTotals } from "./store";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type DocCopy = Omit<Prisma.ConsignmentDocUncheckedCreateInput, "id" | "lines"> & { lines: Omit<Prisma.ConsignmentDocLineUncheckedCreateInput, "id" | "docId">[] };
type LineCopy = Omit<Prisma.ConsignmentLineUncheckedCreateInput, "id" | "importId">;
type ReturnCopy = Omit<Prisma.ConsignmentReturnUncheckedCreateInput, "id" | "lines"> & { lines: Omit<Prisma.ConsignmentReturnLineUncheckedCreateInput, "id" | "returnId">[] };
type CsgPayload = { docs: DocCopy[]; outletLines: LineCopy[] };
type CsrPayload = { ret: ReturnCopy };

export type TrashEntry = {
  id: number;
  kind: "CSG" | "CSR";
  code: string;
  outletKey: string | null;
  outlet: string;
  boxes: number;
  fileName: string;
  deletedAt: string;
  deletedBy: string | null;
  restoredAt: string | null;
  restoredBy: string | null;
};

export class RestoreError extends Error {}

const strip = <T extends Record<string, unknown>>(row: T, ...keys: (keyof T)[]) => {
  const out = { ...row };
  for (const k of keys) delete out[k];
  return out;
};
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const date = (v: unknown) => (typeof v === "string" ? new Date(v) : (v as Date | null | undefined) ?? null);

/** Whether 0008 is applied. Before it is, deletes still work but are not logged. */
export async function trashReady(): Promise<boolean> {
  try {
    await prisma.consignmentTrash.findFirst({ select: { id: true } });
    return true;
  } catch {
    return false;
  }
}

/** The outlet a CSG belongs to: the page it was deleted from, or the one outlet the workbook has it at. */
async function outletFor(key: string | null, csgKey: string): Promise<{ key: string | null; name: string }> {
  if (key) {
    const [info] = await recentImports(1).catch(() => []);
    if (info) {
      const rows = await prisma.consignmentOutlet.findMany({ where: { importId: BigInt(info.id) }, select: { outlet: true } });
      const hit = rows.find(r => outletKey(r.outlet) === key);
      if (hit) return { key, name: hit.outlet };
    }
    return { key, name: key };
  }
  const at = (await loadCsgOutlets()).get(csgKey) ?? [];
  return at.length === 1 ? { key: outletKey(at[0]), name: at[0] } : { key: null, name: at.join(", ") };
}

const toEntry = (r: Awaited<ReturnType<typeof prisma.consignmentTrash.findFirstOrThrow>>): TrashEntry => ({
  id: Number(r.id), kind: r.kind as "CSG" | "CSR", code: r.code, outletKey: r.outletKey, outlet: r.outlet, boxes: r.boxes,
  fileName: r.fileName, deletedAt: r.deletedAt.toISOString(), deletedBy: r.deletedBy,
  restoredAt: iso(r.restoredAt), restoredBy: r.restoredBy,
});

/**
 * Delete a CSG's document(s) (every number that normalises to `csgNo`) and, when
 * an outlet is given, the lines an outlet upload added for it there. Workbook
 * lines are never touched. Returns what went and whether it was logged.
 */
export async function trashCsg(csgNo: string, by: string, outlet: string | null) {
  const key = docKey(csgNo);
  const logged = await trashReady();
  const where = await outletFor(outlet, key);
  const [info] = await recentImports(1).catch(() => []);
  const importId = info ? BigInt(info.id) : null;

  return prisma.$transaction(async tx => {
    const docs = (await tx.consignmentDoc.findMany({ include: { lines: true } })).filter(d => docKey(d.csgNo) === key);
    const lines = outlet && importId !== null
      ? (await tx.consignmentLine.findMany({ where: { importId, sheet: OUTLET_UPLOAD_SHEET } }))
          .filter(l => l.csgNo && docKey(l.csgNo) === key && outletKey(l.outlet) === outlet)
      : [];
    if (!docs.length && !lines.length) return { docs: 0, lines: 0, logged };

    if (logged) {
      const payload: CsgPayload = {
        docs: docs.map(d => ({ ...strip(d, "id", "lines"), lines: d.lines.map(l => strip(l, "id", "docId")) })),
        outletLines: lines.map(l => strip(l, "id", "importId")),
      };
      await tx.consignmentTrash.create({
        data: {
          kind: "CSG", code: docs[0]?.csgNo ?? lines[0].csgNo ?? csgNo, outletKey: where.key, outlet: where.name || docs[0]?.toCounter || "",
          boxes: docs.length ? docs.reduce((s, d) => s + d.lineTotal, 0) : lines.reduce((s, l) => s + l.qty, 0),
          fileName: docs[0]?.fileName ?? "", deletedBy: by,
          payload: JSON.parse(JSON.stringify(payload, (_k, v) => (typeof v === "bigint" ? Number(v) : v))),
        },
      });
    }
    if (docs.length) await tx.consignmentDoc.deleteMany({ where: { id: { in: docs.map(d => d.id) } } });
    if (lines.length) {
      await tx.consignmentLine.deleteMany({ where: { id: { in: lines.map(l => l.id) } } });
      await syncImportTotals(tx, importId!);
    }
    return { docs: docs.length, lines: lines.length, logged };
  }, { timeout: 30_000 });
}

/** Delete one CSR; its boxes go back onto the CSG. */
export async function trashCsr(code: string, by: string, outlet: string | null) {
  const logged = await trashReady();
  return prisma.$transaction(async tx => {
    const r = await tx.consignmentReturn.findUnique({ where: { code }, include: { lines: true } });
    if (!r) return { removed: false, logged };
    if (logged) {
      const where = await outletFor(outlet, r.csgKey);
      const payload: CsrPayload = { ret: { ...strip(r, "id", "lines"), lines: r.lines.map(l => strip(l, "id", "returnId")) } };
      await tx.consignmentTrash.create({
        data: {
          kind: "CSR", code: r.code, outletKey: where.key, outlet: where.name || r.fromOutlet, boxes: r.lineTotal, fileName: r.fileName,
          deletedBy: by, payload: JSON.parse(JSON.stringify(payload, (_k, v) => (typeof v === "bigint" ? Number(v) : v))),
        },
      });
    }
    await tx.consignmentReturn.delete({ where: { id: r.id } });
    return { removed: true, logged };
  }, { timeout: 30_000 });
}

/**
 * Put a deleted file back exactly as it was. Refuses when a file with the same
 * number has been uploaded since, so a restore never overwrites newer work.
 */
export async function restoreTrash(id: number, by: string): Promise<TrashEntry> {
  return prisma.$transaction(async (tx: Tx) => {
    const t = await tx.consignmentTrash.findUnique({ where: { id: BigInt(id) } });
    if (!t) throw new RestoreError("That entry is not in the log.");
    if (t.restoredAt) throw new RestoreError(`${t.code} has already been restored.`);

    if (t.kind === "CSG") {
      const p = t.payload as unknown as CsgPayload;
      const key = docKey(t.code);
      const now = (await tx.consignmentDoc.findMany({ select: { csgNo: true } })).filter(d => docKey(d.csgNo) === key);
      if (p.docs.length && now.length) throw new RestoreError(`${now[0].csgNo} has been uploaded again since. Delete that file first if you want the old one back.`);
      for (const d of p.docs) {
        const { lines, ...head } = d;
        await tx.consignmentDoc.create({
          data: { ...head, docDate: date(head.docDate), uploadedAt: date(head.uploadedAt) ?? undefined, lines: { create: lines } },
        });
      }
      if (p.outletLines.length) {
        const [info] = await tx.consignmentImport.findMany({ orderBy: { uploadedAt: "desc" }, take: 1 });
        if (!info) throw new RestoreError("No workbook is loaded, so the outlet lines have nowhere to go.");
        const csgNos = [...new Set(p.outletLines.map(l => l.csgNo!).filter(Boolean))];
        const outlets = [...new Set(p.outletLines.map(l => l.outlet))];
        await tx.consignmentLine.deleteMany({ where: { importId: info.id, sheet: OUTLET_UPLOAD_SHEET, outlet: { in: outlets }, csgNo: { in: csgNos } } });
        await tx.consignmentLine.createMany({ data: p.outletLines.map(l => ({ ...l, importId: info.id, csgDate: date(l.csgDate) })) });
        await syncImportTotals(tx, info.id);
      }
    } else {
      const { ret } = t.payload as unknown as CsrPayload;
      if (await tx.consignmentReturn.findUnique({ where: { code: ret.code }, select: { id: true } })) {
        throw new RestoreError(`${ret.code} has been uploaded again since. Delete that one first if you want the old one back.`);
      }
      const { lines, ...head } = ret;
      await tx.consignmentReturn.create({
        data: { ...head, docDate: date(head.docDate), uploadedAt: date(head.uploadedAt) ?? undefined, lines: { create: lines } },
      });
    }

    const done = await tx.consignmentTrash.update({ where: { id: t.id }, data: { restoredAt: new Date(), restoredBy: by } });
    return toEntry(done);
  }, { timeout: 30_000 });
}

/** Deleted files for one outlet (or every outlet), newest first. Never throws: before 0008 there is no log. */
export async function loadTrash(opts: { outletKey?: string; from?: Date; to?: Date; take?: number } = {}): Promise<TrashEntry[]> {
  try {
    const rows = await prisma.consignmentTrash.findMany({
      where: {
        ...(opts.outletKey ? { outletKey: opts.outletKey } : {}),
        ...(opts.from || opts.to ? { deletedAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lt: opts.to } : {}) } } : {}),
      },
      orderBy: { deletedAt: "desc" },
      take: opts.take ?? 200,
    });
    return rows.map(toEntry);
  } catch {
    return [];
  }
}
