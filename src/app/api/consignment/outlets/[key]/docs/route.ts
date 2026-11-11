import { getAccess, guardDept } from "@/lib/auth";
import { docKey, outletKey } from "@/lib/consignment/analyze";
import { DocError, parseCsgDocs, type ParsedDoc, type ParsedDocs } from "@/lib/consignment/doc-parse";
import { readDocSheets } from "@/lib/consignment/doc-read";
import { saveDocs } from "@/lib/consignment/doc-store";
import { addOutletLines, loadCsgOutlets, loadSnapshot } from "@/lib/consignment/store";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB
export const maxDuration = 120;

const boxesOf = (d: ParsedDoc) => d.lines.reduce((s, l) => s + l.qty, 0);
const words = (s: string) => new Set(s.toUpperCase().split(/[^A-Z0-9]+/).filter(w => w.length > 1));

export type OutletUploadResult = {
  ok: true;
  /** CSGs the workbook already lists at this outlet: their documents are filed and Details opens. */
  filed: { csgNo: string; boxes: number }[];
  /** CSGs the workbook did not list here: added to the outlet now. */
  added: { csgNo: string; boxes: number }[];
  /** CSGs left out because the workbook has them at another outlet. */
  skipped: { csgNo: string; at: string[] }[];
  warnings: string[];
};

/**
 * One file with the ERP CSG documents for one outlet. Every document in it goes
 * live at once: a CSG the workbook lists at this outlet gets its document (and
 * Details); a CSG the workbook does not list is added to the outlet, so the
 * outlet's units and ages include it straight away. A CSG the workbook has at a
 * different outlet is left out, so the same stock is never counted twice.
 */
export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const denied = await guardDept();
  if (denied) return denied;

  const key = outletKey(decodeURIComponent((await ctx.params).key));
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose the outlet's file (.xlsx)." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return Response.json({ error: "The file must be an .xlsx file." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is too large (4 MB max). Split it into smaller files." }, { status: 413 });

  let parsed: ParsedDocs;
  try {
    parsed = parseCsgDocs(await readDocSheets(await file.arrayBuffer()));
  } catch (e) {
    const msg = e instanceof DocError ? e.message : "Could not read that file as an .xlsx document.";
    return Response.json({ error: msg }, { status: 422 });
  }
  if (!parsed.docs.length) return Response.json({ error: "No CSG document was found in that file." }, { status: 422 });

  try {
    const snap = await loadSnapshot();
    const known = snap?.outlets.find(o => outletKey(o.outlet) === key) ?? snap?.lines.find(l => outletKey(l.outlet) === key);
    if (!snap || !known) return Response.json({ error: "This outlet is not in the current workbook." }, { status: 404 });

    const where = await loadCsgOutlets();
    const filed: ParsedDoc[] = [];
    const added: ParsedDoc[] = [];
    const skipped: OutletUploadResult["skipped"] = [];
    for (const d of parsed.docs) {
      const at = where.get(docKey(d.csgNo)) ?? [];
      if (at.some(o => outletKey(o) === key)) filed.push(d);
      else if (at.length) skipped.push({ csgNo: d.csgNo, at });
      else added.push(d);
    }
    if (!filed.length && !added.length) {
      const first = skipped[0];
      return Response.json({
        error: `${skipped.map(s => s.csgNo).join(", ")} ${skipped.length === 1 ? "is" : "are"} listed at ${first.at.join(", ")} in the workbook, not at this outlet. Nothing was saved.`,
      }, { status: 422 });
    }

    // A document addressed to a different counter is probably the wrong outlet's file.
    const warnings = [...parsed.warnings];
    const want = words(known.outlet);
    for (const d of added) {
      const to = words(d.toCounter);
      if (to.size && ![...to].some(w => want.has(w))) warnings.push(`${d.csgNo} is addressed to ${d.toCounter}, which does not look like ${known.outlet}. Check it is the right outlet.`);
    }

    const access = await getAccess();
    const by = access.kind === "ok" ? access.staff.email : "unknown";
    await saveDocs([...filed, ...added], file.name, by);
    if (added.length) await addOutletLines({ outlet: known.outlet, owner: known.owner, state: known.state, town: known.town }, added);
    if (added.length) warnings.push("The CSGs added here are not in the workbook. Add them there too, or the next workbook upload will remove them.");

    const out: OutletUploadResult = {
      ok: true,
      filed: filed.map(d => ({ csgNo: d.csgNo, boxes: boxesOf(d) })),
      added: added.map(d => ({ csgNo: d.csgNo, boxes: boxesOf(d) })),
      skipped, warnings,
    };
    return Response.json(out);
  } catch {
    return Response.json({ error: "Could not save. Check that the CSG document tables have been created (0005 SQL)." }, { status: 500 });
  }
}
