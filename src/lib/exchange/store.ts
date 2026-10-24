// Exchange Stock data access. Pages and routes call guardDept()/the (dash)
// layout first — Prisma bypasses row level security.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { matchExchanges, todayMYT, type IssueStatus } from "./match";
import type { ParsedListing } from "./parse";

export const ResolveZ = z.object({
  issueId: z.coerce.number().int().positive(),
  // "open" clears a manual resolution.
  status: z.enum(["returned", "waived", "open"]),
  note: z.string().trim().max(500).default(""),
});

// The daily listings may carry other adjustment types; only exchanges are tracked for returns.
const EXCHANGE_ONLY = {
  OR: [
    { adjType: { contains: "exchange", mode: "insensitive" as const } },
    { docNo: { startsWith: "EXC" } },
    { docNo: { startsWith: "EXR" } },
  ],
};

/** Every issue line with its returned / open quantity and overdue flag. */
export async function loadIssueStatuses(): Promise<IssueStatus[]> {
  const [issues, receives, resolutions] = await Promise.all([
    prisma.exchangeTxn.findMany({
      where: { kind: "issue", ...EXCHANGE_ONLY },
      select: { id: true, docNo: true, docDate: true, location: true, stockId: true, description: true, power: true, quantity: true },
    }),
    prisma.exchangeTxn.findMany({
      where: { kind: "receive", ...EXCHANGE_ONLY },
      select: { location: true, description: true, docDate: true, quantity: true },
    }),
    prisma.exchangeResolution.findMany({ select: { issueTxnId: true, status: true } }),
  ]);
  return matchExchanges(
    issues.map(i => ({ ...i, id: Number(i.id) })),
    receives,
    resolutions.map(r => ({ issueId: Number(r.issueTxnId), status: r.status as "returned" | "waived" })),
    todayMYT(),
  );
}

/**
 * Overdue count for the sidebar badge. Never throws: before 0003 has been
 * applied the table does not exist, and that must not take every page down.
 */
export async function overdueCount(): Promise<number> {
  try {
    return (await loadIssueStatuses()).filter(s => s.overdue).length;
  } catch {
    return 0;
  }
}

export async function saveResolution(input: z.infer<typeof ResolveZ>, by: string) {
  const issueTxnId = BigInt(input.issueId);
  if (input.status === "open") {
    await prisma.exchangeResolution.deleteMany({ where: { issueTxnId } });
    return;
  }
  const issue = await prisma.exchangeTxn.findFirst({ where: { id: issueTxnId, kind: "issue" }, select: { id: true } });
  if (!issue) throw new Error("Issue line not found.");
  await prisma.exchangeResolution.upsert({
    where: { issueTxnId },
    create: { issueTxnId, status: input.status, note: input.note, resolvedBy: by },
    update: { status: input.status, note: input.note, resolvedBy: by, resolvedAt: new Date() },
  });
}

export type TxnFilter = { kind?: "issue" | "receive"; q?: string; location?: string };

/** Transaction lines for the list page, newest first. */
export async function loadTransactions(f: TxnFilter, take = 300) {
  const q = f.q?.trim();
  const rows = await prisma.exchangeTxn.findMany({
    where: {
      ...(f.kind && { kind: f.kind }),
      ...(f.location && { location: f.location }),
      ...(q && {
        OR: [
          { docNo: { contains: q, mode: "insensitive" } },
          { stockId: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { location: { contains: q, mode: "insensitive" } },
        ],
      }),
    },
    orderBy: [{ docDate: "desc" }, { docNo: "desc" }, { lineNo: "asc" }],
    take,
  });
  return rows.map(r => ({
    ...r,
    id: Number(r.id),
    importId: r.importId === null ? null : Number(r.importId),
    netAmount: r.netAmount?.toNumber() ?? null,
    unitPrice: r.unitPrice?.toNumber() ?? null,
    amount: r.amount?.toNumber() ?? null,
  }));
}

export async function loadLocations(): Promise<string[]> {
  const rows = await prisma.exchangeTxn.findMany({ distinct: ["location"], select: { location: true }, orderBy: { location: "asc" } });
  return rows.map(r => r.location);
}

/**
 * Save a parsed listing. Re-uploading a day is safe: lines are upserted on
 * (kind, docNo, lineNo). Returns how many lines were new and how many updated.
 */
export async function importListing(parsed: ParsedListing, fileName: string, by: string) {
  return prisma.$transaction(async tx => {
    const existing = await tx.exchangeTxn.findMany({
      where: { kind: parsed.kind, docNo: { in: [...new Set(parsed.lines.map(l => l.docNo))] } },
      select: { docNo: true, lineNo: true },
    });
    const had = new Set(existing.map(e => `${e.docNo}\u0000${e.lineNo}`));
    const rowsUpdated = parsed.lines.filter(l => had.has(`${l.docNo}\u0000${l.lineNo}`)).length;

    const imp = await tx.exchangeImport.create({
      data: {
        kind: parsed.kind, fileName, dateFrom: parsed.dateFrom, dateTo: parsed.dateTo,
        rowsAdded: parsed.lines.length - rowsUpdated, rowsUpdated, uploadedBy: by,
      },
    });
    for (const l of parsed.lines) {
      const { kind, docNo, lineNo, ...fields } = l;
      await tx.exchangeTxn.upsert({
        where: { kind_docNo_lineNo: { kind, docNo, lineNo } },
        create: { kind, docNo, lineNo, ...fields, importId: imp.id },
        update: { ...fields, importId: imp.id },
      });
    }
    return { documents: parsed.documents, rowsAdded: parsed.lines.length - rowsUpdated, rowsUpdated };
  }, { timeout: 30_000 });
}

export async function recentImports(take = 10) {
  const rows = await prisma.exchangeImport.findMany({ orderBy: { uploadedAt: "desc" }, take });
  return rows.map(r => ({ ...r, id: Number(r.id) }));
}

/** Every exchange line for one customer (Location), oldest first, with money as numbers. */
export async function loadCustomerLines(location: string) {
  const rows = await prisma.exchangeTxn.findMany({
    where: { location: { equals: location, mode: "insensitive" }, ...EXCHANGE_ONLY },
    orderBy: [{ docDate: "asc" }, { docNo: "asc" }, { lineNo: "asc" }],
  });
  return rows.map(r => ({
    ...r,
    id: Number(r.id),
    importId: r.importId === null ? null : Number(r.importId),
    netAmount: r.netAmount?.toNumber() ?? null,
    unitPrice: r.unitPrice?.toNumber() ?? null,
    amount: r.amount?.toNumber() ?? null,
  }));
}
