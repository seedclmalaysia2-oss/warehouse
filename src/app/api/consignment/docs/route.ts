import ExcelJS from "exceljs";
import { getAccess, guardDept } from "@/lib/auth";
import { docKey } from "@/lib/consignment/analyze";
import { DocError, parseCsgDocs, type ParsedDocs } from "@/lib/consignment/doc-parse";
import { saveDocs } from "@/lib/consignment/doc-store";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB

// One CSG document file per request, so a long batch can report file by file.
export async function POST(req: Request) {
  const denied = await guardDept();
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a CSG document (.xlsx)." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return Response.json({ error: "The document must be an .xlsx file." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is too large (4 MB max)." }, { status: 413 });

  let parsed: ParsedDocs;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    parsed = parseCsgDocs(wb);
  } catch (e) {
    const msg = e instanceof DocError ? e.message : "Could not read that file as an .xlsx document.";
    return Response.json({ error: msg }, { status: 422 });
  }

  // Sent from an outlet's page: the file must be a CSG that outlet is waiting
  // for, so a wrong file is turned away rather than filed against the wrong CSG.
  const expected = String(form?.get("expect") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (expected.length) {
    const want = new Set(expected.map(docKey));
    const fits = parsed.docs.filter(d => want.has(docKey(d.csgNo)));
    const others = parsed.docs.filter(d => !want.has(docKey(d.csgNo))).map(d => d.csgNo);
    if (!fits.length) {
      const found = others.join(", ") || "no CSG number";
      const error = expected.length === 1
        ? `This file is ${found}, not ${expected[0]}. Nothing was saved.`
        : `This file is ${found}, which is not listed at this outlet. Nothing was saved.`;
      return Response.json({ error }, { status: 422 });
    }
    parsed = { docs: fits, warnings: [...parsed.warnings, ...others.map(n => `${n} is also in this file but is not at this outlet, so it was left out.`)] };
  }

  const access = await getAccess();
  const by = access.kind === "ok" ? access.staff.email : "unknown";
  try {
    const { saved, replaced } = await saveDocs(parsed.docs, file.name, by);
    return Response.json({
      ok: true, saved, replaced, warnings: parsed.warnings,
      docs: parsed.docs.map(d => ({ csgNo: d.csgNo, toCounter: d.toCounter, boxes: d.lines.reduce((s, l) => s + l.qty, 0) })),
    });
  } catch {
    return Response.json({ error: "Could not save. Check that the CSG document tables have been created (0005 SQL)." }, { status: 500 });
  }
}
