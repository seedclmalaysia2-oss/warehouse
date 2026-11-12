import { getAccess, guardDept } from "@/lib/auth";
import { docKey } from "@/lib/consignment/analyze";
import { DocError, parseCsgDocs, type ParsedDocs } from "@/lib/consignment/doc-parse";
import { readDocSheets } from "@/lib/consignment/doc-read";
import { saveDocs } from "@/lib/consignment/doc-store";
import { CSR_ONLY, withoutReturns } from "@/lib/consignment/return-apply";
import { loadCsgOutlets } from "@/lib/consignment/store";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB
export const maxDuration = 120;

/**
 * One file that holds many CSG documents (the ERP's "page" exports). Every
 * document is filed under its CSG number, which is what an outlet's page looks
 * up, so each lands on its own outlet without being told which. A CSG is only
 * ever stored once: pages repeating a number are merged, a page printed twice is
 * counted once, and a number that is already stored is replaced, not added again.
 * One file per request, so a long batch can report file by file.
 */
export async function POST(req: Request) {
  const denied = await guardDept();
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a CSG file (.xlsx)." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return Response.json({ error: "The file must be an .xlsx file." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is too large (4 MB max). Split it into smaller files." }, { status: 413 });

  let parsed: ParsedDocs;
  try {
    parsed = parseCsgDocs(await readDocSheets(await file.arrayBuffer()));
  } catch (e) {
    const msg = e instanceof DocError ? e.message : "Could not read that file as an .xlsx document.";
    return Response.json({ error: msg }, { status: 422 });
  }

  const split = withoutReturns(parsed.docs);
  if (!split.docs.length && split.returns.length) return Response.json({ error: `${split.returns.join(", ")}: ${CSR_ONLY}` }, { status: 422 });
  parsed = { docs: split.docs, warnings: [...parsed.warnings, ...split.returns.map(c => `${c} is a CSR, so it was left out.`)] };

  const access = await getAccess();
  const by = access.kind === "ok" ? access.staff.email : "unknown";
  const where = await loadCsgOutlets();

  try {
    const { results } = await saveDocs(parsed.docs, file.name, by, { keepSame: true });
    const boxes = new Map(parsed.docs.map(d => [docKey(d.csgNo), d.lines.reduce((s, l) => s + l.qty, 0)]));
    const rows = results.map(r => ({ ...r, boxes: boxes.get(docKey(r.csgNo)) ?? 0, outlets: where.get(docKey(r.csgNo)) ?? [] }));

    // How many CSGs went to each outlet, for the summary.
    const perOutlet = new Map<string, number>();
    for (const r of rows) for (const o of r.outlets) perOutlet.set(o, (perOutlet.get(o) ?? 0) + 1);

    return Response.json({
      ok: true,
      read: parsed.docs.length,
      added: rows.filter(r => r.status === "new").length,
      updated: rows.filter(r => r.status === "updated").length,
      unchanged: rows.filter(r => r.status === "unchanged").length,
      replaced: rows.filter(r => r.status === "updated").map(r => ({ csgNo: r.csgNo, was: r.was ?? "" })),
      noOutlet: rows.filter(r => !r.outlets.length).map(r => r.csgNo),
      outlets: [...perOutlet].map(([name, csgs]) => ({ name, csgs })).sort((a, b) => a.name.localeCompare(b.name)),
      warnings: parsed.warnings,
    });
  } catch {
    return Response.json({ error: "Could not save. Check that the CSG document tables have been created (0005 SQL)." }, { status: 500 });
  }
}
