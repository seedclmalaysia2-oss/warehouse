import ExcelJS from "exceljs";
import { getAccess, guardDept } from "@/lib/auth";
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
