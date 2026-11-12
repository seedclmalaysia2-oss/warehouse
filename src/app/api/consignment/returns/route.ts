import { getAccess, guardDept } from "@/lib/auth";
import { docKey, outletKey } from "@/lib/consignment/analyze";
import { DocError, parseCsgDocs, type ParsedDoc, type ParsedDocs } from "@/lib/consignment/doc-parse";
import { readDocSheets } from "@/lib/consignment/doc-read";
import { parseReturnCode, takeOff } from "@/lib/consignment/return-apply";
import { csaKeys, loadCsgBoxes, loadReturnsFor, saveReturns } from "@/lib/consignment/return-store";
import { loadCsgOutlets } from "@/lib/consignment/store";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB
export const maxDuration = 120;

export type ReturnState = "saved" | "confirm" | "no-csg" | "not-csr";
export type ReturnResult = {
  code: string;
  csgKey: string | null;
  outlet: string;
  boxes: number;
  state: ReturnState;
  /** Why it was not saved. */
  reason?: string;
  /** Boxes the CSG still holds after every CSR against it (saved only). */
  left?: number;
  /** Returned boxes that are not on the CSG, or more than it still holds (saved only). */
  short?: { description: string; power: string | null; qty: number }[];
};

const boxesOf = (d: ParsedDoc) => d.lines.reduce((s, l) => s + l.qty, 0);

/**
 * One CSR file per request; a file can hold several CSRs. The order of the
 * paperwork is CSG, then CSA, then CSR:
 *  - a CSR whose CSG has not been uploaded is turned away;
 *  - a CSR whose CSG has no CSA on record needs the user's go-ahead
 *    (`proceed=1`); until then nothing in the file is saved.
 */
export async function POST(req: Request) {
  const denied = await guardDept();
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const proceed = form?.get("proceed") === "1";
  // Sent from an outlet's page: only CSRs for a CSG listed at that outlet (and, from a CSG's row, for that CSG) are taken.
  const onlyOutlet = String(form?.get("outlet") ?? "").trim() ? outletKey(String(form?.get("outlet"))) : null;
  const onlyCsg = String(form?.get("csg") ?? "").trim() ? docKey(String(form?.get("csg"))) : null;
  if (!(file instanceof File)) return Response.json({ error: "Choose a CSR file (.xlsx)." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return Response.json({ error: "The file must be an .xlsx file." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is too large (4 MB max). Split it into smaller files." }, { status: 413 });

  let parsed: ParsedDocs;
  try {
    parsed = parseCsgDocs(await readDocSheets(await file.arrayBuffer()));
  } catch (e) {
    const msg = e instanceof DocError ? e.message : "Could not read that file as an .xlsx document.";
    return Response.json({ error: msg }, { status: 422 });
  }

  try {
    const results: ReturnResult[] = [];
    const csr: { doc: ParsedDoc; csgKey: string }[] = [];
    for (const d of parsed.docs) {
      const p = parseReturnCode(d.csgNo);
      if (p) { csr.push({ doc: d, csgKey: p.csgKey }); continue; }
      const what = /^CS[GF]/i.test(d.csgNo) ? "This is a CSG. Use Upload CSG file for it." : "This is not a CSR. Only CSR files are read here.";
      results.push({ code: d.csgNo, csgKey: null, outlet: d.toCounter, boxes: boxesOf(d), state: "not-csr", reason: what });
    }

    const csg = await loadCsgBoxes(csr.map(c => c.csgKey));
    const csa = await csaKeys();
    const listed = onlyOutlet ? await loadCsgOutlets() : null;
    const ready: ParsedDoc[] = [];
    for (const { doc, csgKey } of csr) {
      const base = { code: doc.csgNo, csgKey, outlet: doc.fromCounter, boxes: boxesOf(doc) };
      if (onlyCsg && csgKey !== onlyCsg) {
        results.push({ ...base, state: "no-csg", reason: `${doc.csgNo} comes off ${csgKey}, not ${onlyCsg}. Nothing was saved for it.` });
      } else if (listed && !(listed.get(csgKey) ?? []).some(o => outletKey(o) === onlyOutlet)) {
        results.push({ ...base, state: "no-csg", reason: `${csgKey} is not listed at this outlet. Nothing was saved for it.` });
      } else if (!csg.has(csgKey)) {
        results.push({ ...base, state: "no-csg", reason: `${csgKey} has not been uploaded. Upload the CSG first, then this CSR.` });
      } else if (!csa.has(csgKey) && !proceed) {
        results.push({ ...base, state: "confirm", reason: `No CSA is on record for ${csgKey}.` });
      } else {
        ready.push(doc);
        results.push({ ...base, state: "saved" });
      }
    }

    // Waiting on the user's go-ahead: save nothing from this file yet.
    if (results.some(r => r.state === "confirm")) {
      return Response.json({ ok: true, needsConfirm: true, saved: 0, replaced: 0, docs: results.map(r => (r.state === "saved" ? { ...r, state: "confirm" as const, reason: "Waiting for the others in this file." } : r)), warnings: parsed.warnings });
    }

    let replaced = 0;
    if (ready.length) {
      const access = await getAccess();
      const by = access.kind === "ok" ? access.staff.email : "unknown";
      ({ replaced } = await saveReturns(ready, file.name, by));
      // With the new CSR stored, what each CSG still holds.
      for (const r of results.filter(x => x.state === "saved")) {
        const given = csg.get(r.csgKey!)!;
        const t = takeOff(given, (await loadReturnsFor(r.csgKey!)).flatMap(x => x.lines));
        r.left = t.remaining.reduce((s, l) => s + l.qty, 0);
        const names = new Map(ready.flatMap(d => d.lines).map(l => [l.stockId, l.description]));
        r.short = t.unmatched.map(u => ({ description: names.get(u.stockId) ?? u.stockId, power: u.power, qty: u.short }));
      }
    }
    return Response.json({ ok: true, needsConfirm: false, saved: ready.length, replaced, docs: results, warnings: parsed.warnings });
  } catch {
    return Response.json({ error: "Could not save. Check that the CSR tables have been created (0007 SQL)." }, { status: 500 });
  }
}
